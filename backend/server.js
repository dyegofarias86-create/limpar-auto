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
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString(), version: 'v2.3-upload-fix' }));

// Serve React frontend in production
if (IS_PROD) {
  const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
  const fs = require('fs');
  app.use(express.static(frontendDist));
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
      var yearSel = Array.from(document.querySelectorAll('select')).find(s => s.querySelector('option[value="2026"]') && s.querySelector('option[value="2024"]'));
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
        // Interceptar fetch para injetar &month=
        if(!window.__fetchPatched){
          window.__fetchPatched=true;
          var origFetch=window.fetch;
          window.fetch=function(url,opts){
            if(typeof url==='string' && url.includes('/api/marketing') && !url.includes('/api/marketing/') && window.__mktMonth && window.__mktMonth!=='0'){
              url = url + (url.includes('?')?'&':'?') + 'month=' + window.__mktMonth;
            }
            return origFetch(url,opts);
          };
        }
      }
    }
  });
  _obs.observe(document.body, {childList:true, subtree:true});
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
