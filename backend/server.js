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
// Override ANTES do app.use onedrive: preview usa SERVICOS para bater com tela Faturamento
app.get('/api/onedrive/preview', require('./middleware/auth').authMiddleware, (req, res) => {
  const { db } = require('./db/schema');
  const m = parseInt(req.query.month) || new Date().getMonth() + 1;
  const y = parseInt(req.query.year) || new Date().getFullYear();
  let data = db.prepare(`SELECT u.name as rep_name, SUM(b.qty) as tmo, SUM(b.total) as revenue FROM billing b JOIN representatives r ON b.representative_id = r.id JOIN users u ON r.user_id = u.id WHERE b.product = 'SERVICOS' AND b.month = ? AND b.year = ? GROUP BY b.representative_id ORDER BY revenue DESC`).all(m, y);
  if (!data || data.length === 0) {
    data = db.prepare(`SELECT u.name as rep_name, b.qty as tmo, b.total as revenue FROM billing b JOIN representatives r ON b.representative_id = r.id JOIN users u ON r.user_id = u.id WHERE b.product = 'CONSOLIDADO_ONEDRIVE' AND b.month = ? AND b.year = ? ORDER BY revenue DESC`).all(m, y);
  }
  res.json(data);
});

// Override: apos onedrive sync, zerar marketing_budget (sera preenchido pelas planilhas dos reps)
app.post('/api/onedrive/sync-upload', require('./middleware/auth').authMiddleware, (req, res, next) => {
  // Deixar o handler original processar, depois zerar marketing_budget
  const originalJson = res.json.bind(res);
  res.json = function(data) {
    // Zerar marketing_budget apos sync bem-sucedido
    if (data && data.success) {
      try {
        const { db } = require('./db/schema');
        db.prepare('UPDATE marketing_budget SET tmo_qty=0, total_budget=0, used_budget=0, available_budget=0').run();
      } catch(e) {}
    }
    return originalJson(data);
  };
  next();
});

app.use('/api/onedrive', require('./routes/onedrive'));
app.use('/api/notifications', require('./routes/notifications').router);
app.use('/api/faturamento-upload', require('./routes/faturamento-upload'));

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString(), version: 'v2.16-route-order-fix' }));

// Admin: deletar provisoes por mes (executa imediatamente no startup para limpar julho 2026)
(function cleanupJulyProvisions() {
  try {
    const { db } = require('./db/schema');
    const r = db.prepare('DELETE FROM provisions WHERE month=7 AND year=2026').run();
    if (r.changes > 0) console.log(`✅ Cleanup: ${r.changes} provisoes de julho/2026 removidas`);
  } catch(e) { console.error('Cleanup erro:', e.message); }
})();

// Auto-cleanup: zerar marketing_budget no startup (serao preenchidos pelas planilhas dos representantes)
(function cleanupMarketingBudget() {
  try {
    const { db } = require('./db/schema');
    const r = db.prepare('UPDATE marketing_budget SET tmo_qty=0, total_budget=0, used_budget=0, available_budget=0').run();
    if (r.changes > 0) console.log('\u2705 Cleanup startup: marketing_budget zerado (' + r.changes + ' registros)');
  } catch(e) { console.error('Cleanup marketing erro:', e.message); }
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
    // Inject patch script for marketing month/rep filter
    const patch = `<script>
(function(){
  // Interceptar fetch para filtrar por mes/rep usando endpoint dedicado
  if(!window.__fetchPatched){
    window.__fetchPatched=true;
    var origFetch=window.fetch;
    window.fetch=function(url,opts){
      if(typeof url==='string' && url.includes('/api/marketing') && !url.includes('/api/marketing/') && !url.includes('/api/marketing-month')){
        var extra='';
        if(window.__mktMonth && window.__mktMonth!=='0') extra+=(url.includes('?')||extra?'&':'?')+'month='+window.__mktMonth;
        if(window.__mktReps && window.__mktReps.length===1) extra+=(url.includes('?')||extra?'&':'?')+'rep_id='+window.__mktReps[0];
        if(extra){ url=url.replace('/api/marketing','/api/marketing-month')+extra; }
      }
      return origFetch(url,opts);
    };
  }

  function injectMktFilters(){
    // Nao usa flag global - checa se elementos AINDA estao no DOM
    // Isso permite re-injetar apos navegacao SPA (React unmount/remount)
    var yearSel=Array.from(document.querySelectorAll('select')).find(s=>Array.from(s.options).some(o=>o.text==='2026')&&Array.from(s.options).some(o=>o.text==='2024'));
    if(!yearSel) return;
    var container=yearSel.parentElement;
    if(container.querySelector('[data-mkt-filters]')) return; // ja injetado e ainda no DOM

    var wrapper=document.createElement('div');
    wrapper.setAttribute('data-mkt-filters','1');
    wrapper.style.cssText='display:flex;align-items:center;gap:8px;flex-wrap:wrap;';
    // Nao injeta filtro de mes - o componente React ja tem o proprio

    // --- MULTI-SELECT REPRESENTANTES ---
    window.__mktReps=[];
    var msd=document.createElement('div');
    msd.style.cssText='position:relative;display:inline-block;';
    var msbtn=document.createElement('button');
    msbtn.type='button';
    msbtn.textContent='Representantes \u25BE';
    msbtn.style.cssText='padding:6px 12px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;cursor:pointer;font-size:14px;white-space:nowrap;min-width:160px;text-align:left;';
    var msdrop=document.createElement('div');
    msdrop.style.cssText='display:none;position:absolute;top:calc(100% + 4px);left:0;background:#fff;border:1px solid #e2e8f0;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.1);z-index:9999;min-width:200px;max-height:280px;overflow-y:auto;padding:6px 0;';
    msbtn.addEventListener('click',function(e){e.stopPropagation();msdrop.style.display=msdrop.style.display==='none'?'block':'none';});
    document.addEventListener('click',function(){msdrop.style.display='none';});
    msd.appendChild(msbtn); msd.appendChild(msdrop); wrapper.appendChild(msd);

    function updateBtnLabel(){
      var sel=window.__mktReps||[];
      msbtn.textContent=sel.length===0?'Representantes \u25BE':(sel.length===1?window.__mktRepNames[sel[0]]||'1 rep':sel.length+' reps selecionados');
    }
    window.__mktRepNames={};
    function buildRepList(reps){
      // Opcao "Todos"
      var allDiv=document.createElement('div');
      allDiv.style.cssText='padding:8px 14px;display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;';
      allDiv.innerHTML='<input type="checkbox" id="mkt_rep_all" checked style="cursor:pointer"> <label for="mkt_rep_all" style="cursor:pointer">Todos os representantes</label>';
      var allCb=allDiv.querySelector('input');
      allDiv.addEventListener('click',function(e){e.stopPropagation();allCb.checked=true;window.__mktReps=[];updateBtnLabel();msdrop.querySelectorAll('[data-rid]').forEach(function(cb){cb.checked=false;});yearSel.dispatchEvent(new Event('change',{bubbles:true}));});
      msdrop.appendChild(allDiv);
      // Divisor
      var sep=document.createElement('div');sep.style.cssText='border-top:1px solid #f1f5f9;margin:4px 0;';msdrop.appendChild(sep);
      // Cada rep
      reps.forEach(function(rep,idx){
        window.__mktRepNames[rep.id]=rep.name;
        var d=document.createElement('div');
        d.style.cssText='padding:8px 14px;display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;';
        var id='mkt_rep_'+rep.id;
        d.innerHTML='<input type="checkbox" id="'+id+'" data-rid="'+rep.id+'" style="cursor:pointer"> <label for="'+id+'" style="cursor:pointer">'+rep.name+'</label>';
        var cb=d.querySelector('input');
        d.addEventListener('click',function(e){e.stopPropagation();cb.checked=!cb.checked;allCb.checked=false;
          if(cb.checked){if(!window.__mktReps.includes(rep.id))window.__mktReps.push(rep.id);}
          else{window.__mktReps=window.__mktReps.filter(function(r){return r!==rep.id;});}
          if(window.__mktReps.length===0){allCb.checked=true;}
          updateBtnLabel();yearSel.dispatchEvent(new Event('change',{bubbles:true}));
        });
        msdrop.appendChild(d);
      });
    }
    // Buscar reps
    var tok='';
    try{var auth=JSON.parse(localStorage.getItem('limpar_auth')||'{}');tok=auth.token||'';}catch(e){}
    if(!tok){var keys=Object.keys(localStorage);for(var i=0;i<keys.length;i++){if(keys[i].toLowerCase().includes('token')){tok=localStorage.getItem(keys[i]);if(tok&&tok.length>20)break;}}}
    fetch('/api/representatives',{headers:{Authorization:'Bearer '+tok}}).then(function(r){return r.json();}).then(function(reps){if(Array.isArray(reps)&&reps.length>0)buildRepList(reps);}).catch(function(){});

    // Inserir wrapper antes do yearSel
    container.insertBefore(wrapper, yearSel);
  }

  // ----- FILTRO MULTI-MES: Provisoes e Gastos -----
  var MONTHS_PT = ['Janeiro','Fevereiro','Mar\u00e7o','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  function makeMultiMonthSelect(currentSel) {
    // Se ja existe, nao duplicar
    if (currentSel.parentElement.querySelector('[data-multi-month]')) return;
    var wrapper = document.createElement('div');
    wrapper.setAttribute('data-multi-month','1');
    wrapper.style.cssText='position:relative;display:inline-block;';
    var btn = document.createElement('button');
    btn.type='button';
    btn.style.cssText='padding:6px 10px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;cursor:pointer;font-size:14px;min-width:130px;text-align:left;';
    var selMonths = [parseInt(currentSel.value)];
    function updateBtnLabel() { btn.textContent = selMonths.length===1 ? MONTHS_PT[selMonths[0]-1] : selMonths.length+' meses \u25BE'; }
    updateBtnLabel();
    var drop = document.createElement('div');
    drop.style.cssText='display:none;position:absolute;top:calc(100% + 4px);left:0;background:#fff;border:1px solid #e2e8f0;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.1);z-index:9999;min-width:160px;max-height:320px;overflow-y:auto;padding:4px 0;';
    btn.onclick=function(e){e.stopPropagation();drop.style.display=drop.style.display==='none'?'block':'none';};
    document.addEventListener('click',function(){drop.style.display='none';});
    MONTHS_PT.forEach(function(mName,idx){
      var mNum=idx+1;
      var row=document.createElement('div');
      row.style.cssText='padding:7px 12px;display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;';
      var cb=document.createElement('input');cb.type='checkbox';
      cb.checked=selMonths.includes(mNum);
      var lbl=document.createElement('label');lbl.textContent=mName;lbl.style.cursor='pointer';
      row.appendChild(cb);row.appendChild(lbl);
      row.addEventListener('click',function(e){e.stopPropagation();cb.checked=!cb.checked;
        if(cb.checked){if(!selMonths.includes(mNum))selMonths.push(mNum);}else{selMonths=selMonths.filter(function(x){return x!==mNum;});}
        if(selMonths.length===0){selMonths=[mNum];cb.checked=true;}
        updateBtnLabel();
        // Disparar o select original com o primeiro mes selecionado (para acionar o re-render React)
        var nativeSetter=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set;
        nativeSetter.call(currentSel, String(selMonths[0]));
        currentSel.dispatchEvent(new Event('change',{bubbles:true}));
        // Guardar todos os meses para que o backend receba
        window.__multiMonths=selMonths;
      });
      drop.appendChild(row);
    });
    wrapper.appendChild(btn);wrapper.appendChild(drop);
    currentSel.style.display='none';
    currentSel.parentElement.insertBefore(wrapper,currentSel);
  }

  function injectMultiMonthFilters() {
    var h1=document.querySelector('h1');
    if(!h1) return;
    var pg=h1.textContent.trim();
    if(pg==='Provi\u00f5es'||pg==='Gastos'){
      // Encontrar o select de mes (que tem opcoes como Janeiro, Fevereiro, etc)
      var sels=Array.from(document.querySelectorAll('select'));
      var monthSel=sels.find(function(s){
        return Array.from(s.options).some(function(o){return o.text==='Janeiro'||o.text==='Fevereiro'||o.text==='Junho';});
      });
      if(monthSel) makeMultiMonthSelect(monthSel);
    }
  }

  // Rodar inject frequentemente para garantir que apareca antes do usuario clicar
  var _obs=new MutationObserver(function(){
    injectMktFilters();
    injectMultiMonthFilters();
  });
  _obs.observe(document.body,{childList:true,subtree:true});
  // Tambem rodar em intervalos curtos para pegar o momento certo
  var _retryCount=0;
  var _retryInterval=setInterval(function(){
    injectMktFilters();
    injectMultiMonthFilters();
    _retryCount++;
    if(_retryCount>20) clearInterval(_retryInterval); // para apos 2s
  },100);
  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',function(){setTimeout(function(){injectMktFilters();injectMultiMonthFilters();},50);});}else{setTimeout(function(){injectMktFilters();injectMultiMonthFilters();},50);}
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
