const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db/schema');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { createNotification } = require('./notifications');
const router = express.Router();
router.use(authMiddleware);

// ── Listar provisões com filtros ─────────────────────────────────
router.get('/', (req, res) => {
  const { month, year, rep_id, client_id, group_name } = req.query;
  const m = parseInt(month) || new Date().getMonth() + 1;
  const y = parseInt(year)  || new Date().getFullYear();

  let cond = 'WHERE p.month = ? AND p.year = ?';
  const params = [m, y];

  const rid = rep_id || (req.user.role === 'representative' ? req.user.rep_id : null);
  if (rid)         { cond += ' AND p.representative_id = ?'; params.push(parseInt(rid)); }
  if (client_id)   { cond += ' AND p.client_id = ?';         params.push(parseInt(client_id)); }
  if (group_name)  { cond += ' AND c.group_name = ?';        params.push(group_name); }

  const data = db.prepare(`
    SELECT p.*, c.store_name, c.group_name, c.brand, c.city,
      u.name as rep_name
    FROM provisions p
    JOIN clients c ON p.client_id = c.id
    JOIN representatives r ON p.representative_id = r.id
    JOIN users u ON r.user_id = u.id
    ${cond}
    ORDER BY c.group_name, c.store_name
  `).all(...params);
  res.json(data);
});

// ── Resumo por grupo ─────────────────────────────────────────────
router.get('/summary', (req, res) => {
  const { month, year, rep_id } = req.query;
  const m = parseInt(month) || new Date().getMonth() + 1;
  const y = parseInt(year)  || new Date().getFullYear();
  const rid = rep_id || req.user.rep_id;

  let cond = 'WHERE p.month = ? AND p.year = ?';
  const params = [m, y];
  if (rid) { cond += ' AND p.representative_id = ?'; params.push(parseInt(rid)); }

  const data = db.prepare(`
    SELECT c.group_name,
      SUM(p.monthly_provision) as prov_mes,
      SUM(p.previous_balance)  as saldo_anterior,
      SUM(p.total_provision)   as prov_total,
      SUM(p.withdrawn)         as retiradas,
      SUM(p.current_balance)   as saldo_atual
    FROM provisions p JOIN clients c ON p.client_id = c.id
    ${cond}
    GROUP BY c.group_name ORDER BY prov_total DESC
  `).all(...params);
  res.json(data);
});

// ── Resumo por representante ─────────────────────────────────────
router.get('/by-rep', (req, res) => {
  const { month, year } = req.query;
  const m = parseInt(month) || new Date().getMonth() + 1;
  const y = parseInt(year)  || new Date().getFullYear();

  const data = db.prepare(`
    SELECT u.name as rep_name,
      SUM(p.monthly_provision) as prov_mes,
      SUM(p.previous_balance)  as saldo_anterior,
      SUM(p.total_provision)   as prov_total,
      SUM(p.withdrawn)         as retiradas,
      SUM(p.current_balance)   as saldo_atual
    FROM provisions p
    JOIN representatives r ON p.representative_id = r.id
    JOIN users u ON r.user_id = u.id
    WHERE p.month = ? AND p.year = ?
    GROUP BY p.representative_id ORDER BY prov_total DESC
  `).all(m, y);
  res.json(data);
});

// ── Fazer retirada ───────────────────────────────────────────────
router.post('/withdraw', (req, res) => {
  const { provision_id, representative_id, client_id, description, amount, date } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Valor inválido' });

  const prov = db.prepare('SELECT * FROM provisions WHERE id = ?').get(provision_id);
  if (!prov) return res.status(404).json({ error: 'Provisão não encontrada' });
  if (amount > prov.current_balance) return res.status(400).json({ error: 'Valor maior que saldo disponível' });

  const newWithdrawn = prov.withdrawn + amount;
  const newBalance   = prov.current_balance - amount;

  const wdId = db.prepare(
    'INSERT INTO provision_withdrawals (provision_id, representative_id, client_id, description, amount, date) VALUES (?,?,?,?,?,?)'
  ).run(provision_id, representative_id, client_id, description, amount, date).lastInsertRowid;

  db.prepare('UPDATE provisions SET withdrawn = ?, current_balance = ? WHERE id = ?').run(newWithdrawn, newBalance, provision_id);

  try {
    const actorName = req.user.name || req.user.email;
    createNotification(db, {
      type: 'provision',
      title: '💰 Retirada de provião',
      body: `${actorName} retirou R$ ${Number(amount||0).toLocaleString('pt-BR', {minimumFractionDigits:2})} de provião`,
      source: 'provisions', source_id: wdId,
      actor_id: req.user.id, actor_name: actorName,
    });
  } catch(e) {}

  res.json({ success: true, withdrawal_id: wdId, new_balance: newBalance });
});

// ── Reverter retirada (somente líder, com senha) ─────────────────
router.post('/withdraw/:id/reverse', (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Senha obrigatória' });

  // Only leader can reverse
  if (req.user.role !== 'leader') {
    return res.status(403).json({ error: 'Apenas o líder pode reverter retiradas' });
  }

  // Verify leader password
  const leader = db.prepare('SELECT * FROM users WHERE id = ? AND role = ?').get(req.user.id, 'leader');
  if (!leader || !bcrypt.compareSync(password, leader.password)) {
    return res.status(401).json({ error: 'Senha de líder incorreta' });
  }

  // Get withdrawal
  const wd = db.prepare('SELECT * FROM provision_withdrawals WHERE id = ?').get(req.params.id);
  if (!wd) return res.status(404).json({ error: 'Retirada não encontrada' });
  if (wd.reversed) return res.status(400).json({ error: 'Retirada já foi revertida' });

  // Restore provision balance
  const prov = db.prepare('SELECT * FROM provisions WHERE id = ?').get(wd.provision_id);
  if (!prov) return res.status(404).json({ error: 'Provisão não encontrada' });

  const newWithdrawn = Math.max(0, prov.withdrawn - wd.amount);
  const newBalance   = prov.current_balance + wd.amount;

  db.prepare('UPDATE provision_withdrawals SET reversed = 1, reversed_at = datetime(\'now\'), reversed_by = ? WHERE id = ?')
    .run(req.user.id, wd.id);
  db.prepare('UPDATE provisions SET withdrawn = ?, current_balance = ? WHERE id = ?')
    .run(newWithdrawn, newBalance, prov.id);

  res.json({ success: true, new_balance: newBalance });
});

// ── Listar retiradas ─────────────────────────────────────────────
router.get('/withdrawals', (req, res) => {
  const { rep_id, month, year } = req.query;
  const rid = rep_id || req.user.rep_id;
  const m   = parseInt(month) || new Date().getMonth() + 1;
  const y   = parseInt(year)  || new Date().getFullYear();

  let cond = 'WHERE p.month = ? AND p.year = ?';
  const params = [m, y];
  if (rid) { cond += ' AND pw.representative_id = ?'; params.push(parseInt(rid)); }

  const data = db.prepare(`
    SELECT pw.*, c.store_name, c.group_name,
      p.month, p.year,
      u.name as reversed_by_name
    FROM provision_withdrawals pw
    LEFT JOIN provisions p ON pw.provision_id = p.id
    LEFT JOIN clients c ON pw.client_id = c.id
    LEFT JOIN users u ON pw.reversed_by = u.id
    ${cond}
    ORDER BY pw.created_at DESC
  `).all(...params);
  res.json(data);
});

// DELETE single provision record
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT id FROM provisions WHERE id=?').get(id);
  if (!existing) return res.status(404).json({ error: 'Proviso não encontrada' });
  db.prepare('DELETE FROM provisions WHERE id=?').run(id);
  res.json({ success: true });
});

// DELETE all provisions for a specific month/year (reset before new upload)
router.delete('/reset-month', (req, res) => {
  if (req.user.role !== 'leader') return res.status(403).json({ error: 'Sem permissão' });
  const { month, year } = req.query;
  const m = parseInt(month);
  const y = parseInt(year);
  if (!m || !y) return res.status(400).json({ error: 'month e year são obrigatórios' });
  const result = db.prepare('DELETE FROM provisions WHERE month = ? AND year = ?').run(m, y);
  res.json({ success: true, deleted: result.changes });
});

module.exports = router;
