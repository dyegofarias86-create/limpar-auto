const express = require('express');
const { db } = require('../db/schema');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();
router.use(authMiddleware);

router.get('/', (req, res) => {
  const { year, rep_id } = req.query;
  const y = parseInt(year) || new Date().getFullYear();
  const rid = rep_id || req.user.rep_id;

  let cond = 'WHERE mb.year = ?';
  const params = [y];
  if (rid) { cond += ' AND mb.representative_id = ?'; params.push(rid); }

  const data = db.prepare(`
    SELECT mb.*, u.name as rep_name
    FROM marketing_budget mb
    JOIN representatives r ON mb.representative_id = r.id
    JOIN users u ON r.user_id = u.id
    ${cond}
    ORDER BY mb.month
  `).all(...params);
  res.json(data);
});

router.get('/:id/requests', (req, res) => {
  const reqs = db.prepare('SELECT * FROM marketing_requests WHERE marketing_budget_id = ? ORDER BY created_at DESC').all(req.params.id);
  res.json(reqs);
});

router.post('/:id/request', (req, res) => {
  const { description, amount, date } = req.body;
  const budget = db.prepare('SELECT * FROM marketing_budget WHERE id = ?').get(req.params.id);
  if (!budget) return res.status(404).json({ error: 'Verba não encontrada' });
  if (amount > budget.available_budget) return res.status(400).json({ error: 'Valor maior que saldo disponível' });

  db.prepare('INSERT INTO marketing_requests (marketing_budget_id, description, amount, date) VALUES (?,?,?,?)').run(req.params.id, description, amount, date);
  const newUsed = budget.used_budget + amount;
  const newAvail = budget.available_budget - amount;
  db.prepare('UPDATE marketing_budget SET used_budget = ?, available_budget = ? WHERE id = ?').run(newUsed, newAvail, req.params.id);
  res.json({ success: true, new_balance: newAvail });
});

router.get('/annual-summary', (req, res) => {
  const { year, rep_id } = req.query;
  const y = parseInt(year) || new Date().getFullYear();
  const rid = rep_id || req.user.rep_id;

  const monthNames = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const data = [];
  for (let m = 1; m <= 12; m++) {
    let row = { month: m, label: monthNames[m-1], tmo: 0, total: 0, used: 0, available: 0 };
    const q = db.prepare(`SELECT * FROM marketing_budget WHERE year = ? AND month = ? AND representative_id = ?`).get(y, m, rid);
    if (q) { row.tmo = q.tmo_qty; row.total = q.total_budget; row.used = q.used_budget; row.available = q.available_budget; }
    data.push(row);
  }
  res.json(data);
});

module.exports = router;
