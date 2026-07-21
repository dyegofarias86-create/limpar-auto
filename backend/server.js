const express = require('express');
const cors = require('cors');
const path = require('path');
const { initializeDatabase } = require('./db/schema');

// Initialize DB
initializeDatabase();

const app = express();
const PORT = process.env.PORT || 3001;
const IS_PROD = process.env.NODE_ENV === 'production';

// CORS: allow all in dev, or specific origin in prod
if (IS_PROD) {
  app.use(cors({ origin: true, credentials: true }));
} else {
  app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
}
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/dashboard', require('./routes/dashboard'));

// Fix inline: /api/representatives/:id/details sem filtro 'product' (coluna inexistente)
// DEVE ficar ANTES do app.use('/api/representatives') para ter prioridade
app.get('/api/representatives/:id/details', require('./middleware/auth').authMiddleware, (req, res) => {
  try {
    const { db } = require('./db/schema');
    const { id } = req.params;
    const { month = new Date().getMonth()+1, year = new Date().getFullYear() } = req.query;
    const rep = db.prepare('SELECT r.id, u.name, u.email FROM representatives r JOIN users u ON r.user_id = u.id WHERE r.id = ?').get(id);
    if (!rep) return res.status(404).json({ error: 'Representante nao encontrado' });
    const sellers = db.prepare('SELECT s.id, u.name, u.email FROM sellers s JOIN users u ON s.user_id = u.id WHERE s.representative_id = ?').all(id);
    const clients = db.prepare('SELECT * FROM clients WHERE representative_id = ?').all(id);
    const expenses = db.prepare('SELECT category, SUM(amount) as total FROM expenses WHERE representative_id = ? AND month = ? AND year = ? GROUP BY category').all(id, month, year);
    const billing = db.prepare('SELECT COALESCE(SUM(total),0) as total, COALESCE(SUM(qty),0) as tmo FROM billing WHERE representative_id = ? AND month = ? AND year = ?').get(id, month, year);
    const provisions = db.prepare('SELECT COALESCE(SUM(current_balance),0) as balance FROM provisions WHERE representative_id = ? AND month = ? AND year = ?').get(id, month, year);
    const mkt = db.prepare('SELECT * FROM marketing_budget WHERE representative_id = ? AND month = ? AND year = ?').get(id, month, year);
    res.json({ rep, sellers, clients, expenses, billing, provisions, marketing: mkt });
  } catch(e) { console.error('rep details error:', e.message); res.status(500).json({ error: e.message }); }
});

app.use('/api/representatives', require('./routes/representatives'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/provisions', require('./routes/provisions'));
app.use('/api/billing', require('./routes/billing'));
app.use('/api/marketing', require('./routes/marketing'));
app.use('/api/agenda', require('./routes/agenda'));
app.use('/api/clients', require('./routes/clients'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/onedrive', require('./routes/onedrive'));
app.use('/api/notifications', require('./routes/notifications').router);
app.use('/api/faturamento-upload', require('./routes/faturamento-upload'));

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString(), version: 'v2.9-mkt-rep-filter' }));

// Admin: deletar provisoes por mes (executa imediatamente no startup para limpar julho 2026)
(function cleanupJulyProvisions() {
  try {
    const { db } = require('./db/schema');
    const r = db.prepare('DELETE FROM provisions WHERE month=7 AND year=2026').run();
    if (r.changes > 0) console.log(`✅ Cleanup: ${r.changes} provisoes de julho/2026 removidas`);
  } catch(e) { console.error('Cleanup erro:', e.message); }
})();

// Admin: zerar marketing_budget (endpoint + auto-cleanup startup)
(function cleanupMarketingBudget() {
  try {
    const { db } = require('./db/schema');
    // Deletar registros de teste/temporarios onde nao houve upload oficial
    // Nao deletar - apenas disponibilizar endpoint para o lider zerar via UI
  } catch(e) {}
})();

app.post('/api/marketing/reset-budgets', require('./middleware/auth').authMiddleware, (req, res) => {
  if (req.user.role !== 'leader') return res.status(403).json({ error: 'Sem permissao' });
  const { db } = require('./db/schema');
  db.prepare('UPDATE marketing_budget SET tmo_qty=0, total_budget=0, used_budget=0, available_budget=0').run();
  res.json({ success: true });
});

// Admin: filtro mes marketing (injetado inline no servidor)
app.get('/api/marketing-month', (req, res) => {
  const { authMiddleware } = require('./middleware/auth');
  authMiddleware(req, res, () => {
    const { db } = require('./db/schema');
    const { year, month, rep_id } = req.query;
    const y = parseInt(year) || new Date().getFullYear();
    const m = parseInt(month) || 0;
    const rid = rep_id || (req.user.role !== 'leader' ? req.user.rep_id : null);
    let cond = 'WHERE mb.year = ?';
    const params = [y];
    if (rid) { cond += ' AND mb.representative_id = ?'; params.push(rid); }
    if (m > 0) { cond += ' AND mb.month = ?'; params.push(m); }
    const data = db.prepare(`SELECT mb.*, u.name as rep_name FROM marketing_budget mb JOIN representatives r ON mb.representative_id = r.id JOIN users u ON r.user_id = u.id ${cond} ORDER BY mb.month`).all(...params);
    res.json(data);
  });
});

// Serve React frontend in production
if (IS_PROD) {
  const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
  const fs = require('fs');
  // Serve static assets mas NAO o index.html (para forcar a injecao em todos os SPA routes)
  app.use(express.static(frontendDist, { index: false }));
  // SPA fallback + inject month-filter patch for /marketing page
  app.get('*', (req, res) => {
    const indexPath = path.join(frontendDist, 'index.html');
    let html = fs.readFileSync(indexPath, 'utf8');
    // Inject patch script for marketing month filter and provisions reset
    const patch = `<script>
(function(){
  var _obs = new MutationObserver(function(){
    // ---- VERBA MKT: adicionar filtro de mes ----
    var mktPage = document.querySelector('h1');
    if(mktPage && mktPage.textContent.trim() === 'Verba de Marketing'){
      var header = document.querySelector('h1')?.closest('div')?.parentElement?.querySelector('div.flex.gap-2, div.flex.items-center.justify-between > div:last-child');
      // Procurar o seletor de ano (select com 2024/2025/2026)
      var yearSel = Array.from(document.querySelectorAll('select')).find(s => Array.from(s.options).some(o=>o.text==='2026') && Array.from(s.options).some(o=>o.text==='2024'));
      // Adicionar filtro de representante
      if(yearSel && !yearSel.parentElement.querySelector('[data-rep-filter]')){
        fetch('/api/representatives', {headers:{'Authorization':'Bearer '+localStorage.getItem('limpar_token')||''}}).then(r=>r.json()).then(reps=>{
          var repSel = document.createElement('select');
          repSel.setAttribute('data-rep-filter','1');
          repSel.className = yearSel.className;
          repSel.style.marginRight = '8px';
          var allOpt = document.createElement('option'); allOpt.value=''; allOpt.textContent='Todos os reps'; repSel.appendChild(allOpt);
          (Array.isArray(reps)?reps:[]).forEach(function(r){ var o=document.createElement('option'); o.value=r.id; o.textContent=r.name; repSel.appendChild(o); });
          repSel.addEventListener('change', function(){ window.__mktRep = repSel.value; yearSel.dispatchEvent(new Event('change',{bubbles:true})); });
          yearSel.parentElement.insertBefore(repSel, yearSel);
        }).catch(function(){});
      }
      if(yearSel && !yearSel.parentElement.querySelector('[data-month-filter]')){
        var monthSel = document.createElement('select');
        monthSel.setAttribute('data-month-filter','1');
        monthSel.className = yearSel.className;
        monthSel.style.marginRight = '8px';
        var opts = [['0','Todos os meses'],['1','Janeiro'],['2','Fevereiro'],['3','Mar\u00e7o'],['4','Abril'],['5','Maio'],['6','Junho'],['7','Julho'],['8','Agosto'],['9','Setembro'],['10','Outubro'],['11','Novembro'],['12','Dezembro']];
        opts.forEach(function(o){ var opt=document.createElement('option'); opt.value=o[0]; opt.textContent=o[1]; monthSel.appendChild(opt); });
        monthSel.addEventListener('change', function(){
          window.__mktMonth = monthSel.value;
          // Forcar re-render disparando change no year select
          yearSel.dispatchEvent(new Event('change', {bubbles:true}));
          // Restaurar ano
          var ev2 = new Event('change', {bubbles:true});
          yearSel.dispatchEvent(ev2);
        });
        yearSel.parentElement.insertBefore(monthSel, yearSel);
        // Interceptar fetch para filtrar por mes usando endpoint dedicado
        if(!window.__fetchPatched){
          window.__fetchPatched=true;
          var origFetch=window.fetch;
          window.fetch=function(url,opts){
            if(typeof url==='string' && url.includes('/api/marketing') && !url.includes('/api/marketing/') && !url.includes('/api/marketing-month')){
              var extra = '';
              if(window.__mktMonth && window.__mktMonth!=='0') extra += (url.includes('?')||extra?'&':'?')+'month='+window.__mktMonth;
              if(window.__mktRep) extra += (url.includes('?')||extra?'&':'?')+'rep_id='+window.__mktRep;
              if(extra){ url = url.replace('/api/marketing','/api/marketing-month') + extra; }
            }
            return origFetch(url,opts);
          };
        }
      }
    }
  });
  _obs.observe(document.body, {childList:true, subtree:true});
  // Rodar imediatamente tambem (para o caso da pagina ja estar carregada)
  function tryInjectNow(){ var h=document.querySelector('h1'); if(h && h.textContent.trim()==='Verba de Marketing'){ _obs.disconnect(); _obs.takeRecords && _obs.takeRecords(); var fakeNode=document.createElement('span'); document.body.appendChild(fakeNode); document.body.removeChild(fakeNode); } }
  if(document.readyState==='complete'){ setTimeout(tryInjectNow, 500); } else { window.addEventListener('load', function(){ setTimeout(tryInjectNow, 500); }); }
})();
<\/script>`;
    html = html.replace('</body>', patch + '</body>');
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Cache-Control', 'no-store');
    res.send(html);
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 LimpAr API rodando em http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health`);
});
