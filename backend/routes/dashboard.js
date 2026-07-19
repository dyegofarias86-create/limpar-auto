const express = require('express');
const { db } = require('../db/schema');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

router.use(authMiddleware);

const MONTH_NAMES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

// ── Resumo principal ─────────────────────────────────────────────
router.get('/summary', (req, res) => {
  const { month, year } = req.query;
  const m = parseInt(month) || new Date().getMonth() + 1;
  const y = parseInt(year)  || new Date().getFullYear();
  const { role, rep_id } = req.user;

  let repFilter = '';
  let params = [m, y];

  if (role === 'representative' && rep_id) {
    repFilter = ' AND b.representative_id = ?';
    params.push(rep_id);
  }

  // Faturamento
  const billing   = db.prepare(`SELECT COALESCE(SUM(b.total),0) as total, COALESCE(SUM(b.qty),0) as tmo FROM billing b WHERE b.month = ? AND b.year = ? AND b.product IN ('SERVICOS','SERVICO','PRODUTO')${repFilter}`).get(...params);
  // Gastos
  const expParams = repFilter ? [m, y, rep_id] : [m, y];
  const expFilter = (role === 'representative' && rep_id) ? ' AND representative_id = ?' : '';
  const expenses  = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE month = ? AND year = ?${expFilter}`).get(...expParams);
  // Provisão
  const provParams = expParams;
  const provisions = db.prepare(`SELECT COALESCE(SUM(monthly_provision),0) as provisioned, COALESCE(SUM(current_balance),0) as balance, COALESCE(SUM(withdrawn),0) as withdrawn FROM provisions WHERE month = ? AND year = ?${expFilter}`).get(...provParams);
  // MKT
  const mkt = db.prepare(`SELECT COALESCE(SUM(total_budget),0) as total, COALESCE(SUM(used_budget),0) as used, COALESCE(SUM(available_budget),0) as available FROM marketing_budget WHERE month = ? AND year = ?${expFilter}`).get(...provParams);

  // Gastos por categoria
  const expensesByCategory = db.prepare(`SELECT category, COALESCE(SUM(amount),0) as total FROM expenses WHERE month = ? AND year = ?${expFilter} GROUP BY category ORDER BY total DESC`).all(...expParams);

  // Faturamento por grupo
  const billingByGroup = db.prepare(`
    SELECT c.group_name, COALESCE(SUM(b.total),0) as total, COALESCE(SUM(b.qty),0) as tmo
    FROM billing b JOIN clients c ON b.client_id = c.id
    WHERE b.month = ? AND b.year = ? AND b.product IN ('SERVICOS','SERVICO','PRODUTO')${repFilter}
    GROUP BY c.group_name ORDER BY total DESC
  `).all(...params);

  // Histórico 6 meses
  const monthly = [];
  for (let i = 5; i >= 0; i--) {
    let mm = m - i; let yy = y;
    while (mm <= 0) { mm += 12; yy--; }
    const bil  = db.prepare(`SELECT COALESCE(SUM(b.total),0) as total FROM billing b WHERE b.month = ? AND b.year = ? AND b.product IN ('SERVICOS','SERVICO','PRODUTO')${repFilter}`).get(...[mm, yy, ...(repFilter ? [rep_id] : [])]);
    const exp  = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE month = ? AND year = ?${expFilter}`).get(...[mm, yy, ...(expFilter ? [rep_id] : [])]);
    monthly.push({ label: `${MONTH_NAMES[mm-1]}/${yy}`, faturamento: bil.total, gastos: exp.total });
  }

  res.json({
    billing:     { total: billing.total,   tmo: billing.tmo },
    expenses:    { total: expenses.total },
    provisions:  { provisioned: provisions.provisioned, balance: provisions.balance, withdrawn: provisions.withdrawn },
    marketing:   { total: mkt.total, used: mkt.used, available: mkt.available },
    expensesByCategory,
    billingByGroup,
    monthly,
  });
});

// ── Gastos vs Faturamento por representante ──────────────────────
router.get('/rep-comparison', (req, res) => {
  const { month, year } = req.query;
  const m = parseInt(month) || new Date().getMonth() + 1;
  const y = parseInt(year)  || new Date().getFullYear();

  const reps = db.prepare(`SELECT r.id, u.name FROM representatives r JOIN users u ON r.user_id = u.id`).all();

  const data = reps.map(rep => {
    const billing  = db.prepare(`SELECT COALESCE(SUM(total),0) as total, COALESCE(SUM(qty),0) as tmo FROM billing WHERE representative_id = ? AND month = ? AND year = ? AND product IN ('SERVICOS','SERVICO','PRODUTO')`).get(rep.id, m, y);
    const expenses = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE representative_id = ? AND month = ? AND year = ? AND product IN ('SERVICOS','SERVICO','PRODUTO')`).get(rep.id, m, y);
    const pct = billing.total > 0 ? ((expenses.total / billing.total) * 100).toFixed(1) : 0;
    return {
      rep_name:    rep.name,
      faturamento: billing.total,
      tmo:         billing.tmo,
      gastos:      expenses.total,
      pct_gastos:  parseFloat(pct),
    };
  });

  res.json(data.filter(d => d.faturamento > 0 || d.gastos > 0));
});

// ── Gastos mês a mês por representante ──────────────────────────
router.get('/monthly-by-rep', (req, res) => {
  const { year, rep_id } = req.query;
  const y   = parseInt(year) || new Date().getFullYear();
  const rid = rep_id ? parseInt(rep_id) : null;

  const reps = rid
    ? db.prepare(`SELECT r.id, u.name FROM representatives r JOIN users u ON r.user_id = u.id WHERE r.id = ?`).all(rid)
    : db.prepare(`SELECT r.id, u.name FROM representatives r JOIN users u ON r.user_id = u.id`).all();

  const series = reps.map(rep => {
    const months = Array.from({ length: 12 }, (_, i) => {
      const mm  = i + 1;
      const exp = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE representative_id = ? AND month = ? AND year = ? AND product IN ('SERVICOS','SERVICO','PRODUTO')`).get(rep.id, mm, y);
      const bil = db.prepare(`SELECT COALESCE(SUM(total),0) as total FROM billing WHERE representative_id = ? AND month = ? AND year = ? AND product IN ('SERVICOS','SERVICO','PRODUTO')`).get(rep.id, mm, y);
      return { month: MONTH_NAMES[i], gastos: exp.total, faturamento: bil.total };
    });
    return { rep_name: rep.name, rep_id: rep.id, months };
  });

  res.json(series);
});

// ── Provisão total e por representante ──────────────────────────
router.get('/provision-summary', (req, res) => {
  const { month, year } = req.query;
  const m = parseInt(month) || new Date().getMonth() + 1;
  const y = parseInt(year)  || new Date().getFullYear();

  const total = db.prepare(`
    SELECT COALESCE(SUM(monthly_provision),0) as prov_mes,
           COALESCE(SUM(total_provision),0)   as prov_total,
           COALESCE(SUM(withdrawn),0)          as retiradas,
           COALESCE(SUM(current_balance),0)    as saldo
    FROM provisions WHERE month = ? AND year = ?
  `).get(m, y);

  const byRep = db.prepare(`
    SELECT u.name as rep_name,
      COALESCE(SUM(p.monthly_provision),0) as prov_mes,
      COALESCE(SUM(p.total_provision),0)   as prov_total,
      COALESCE(SUM(p.withdrawn),0)          as retiradas,
      COALESCE(SUM(p.current_balance),0)    as saldo
    FROM provisions p
    JOIN representatives r ON p.representative_id = r.id
    JOIN users u ON r.user_id = u.id
    WHERE p.month = ? AND p.year = ?
    GROUP BY p.representative_id ORDER BY prov_total DESC
  `).all(m, y);

  res.json({ total, byRep });
});

// ── Verba MKT total e por representante ─────────────────────────
router.get('/mkt-summary', (req, res) => {
  const { year } = req.query;
  const y = parseInt(year) || new Date().getFullYear();

  const total = db.prepare(`
    SELECT COALESCE(SUM(tmo_qty),0) as tmo,
           COALESCE(SUM(total_budget),0) as total,
           COALESCE(SUM(used_budget),0) as used,
           COALESCE(SUM(available_budget),0) as available
    FROM marketing_budget WHERE year = ?
  `).get(y);

  const byRep = db.prepare(`
    SELECT u.name as rep_name,
      COALESCE(SUM(mb.tmo_qty),0) as tmo,
      COALESCE(SUM(mb.total_budget),0) as total,
      COALESCE(SUM(mb.used_budget),0) as used,
      COALESCE(SUM(mb.available_budget),0) as available
    FROM marketing_budget mb
    JOIN representatives r ON mb.representative_id = r.id
    JOIN users u ON r.user_id = u.id
    WHERE mb.year = ?
    GROUP BY mb.representative_id ORDER BY total DESC
  `).all(y);

  res.json({ total, byRep });
});

module.exports = router;
