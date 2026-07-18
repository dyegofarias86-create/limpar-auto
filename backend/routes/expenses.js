const express = require('express');
const { db } = require('../db/schema');
const { authMiddleware } = require('../middleware/auth');
const { createNotification } = require('./notifications');
const router = express.Router();
router.use(authMiddleware);

router.get('/', (req, res) => {
  const { month, year, rep_id, type } = req.query;
  const m = parseInt(month) || new Date().getMonth() + 1;
  const y = parseInt(year) || new Date().getFullYear();
  const { role } = req.user;

  let query = `SELECT e.*, u.name as rep_name, su.name as seller_name
    FROM expenses e
    LEFT JOIN representatives r ON e.representative_id = r.id
    LEFT JOIN users u ON r.user_id = u.id
    LEFT JOIN sellers s ON e.seller_id = s.id
    LEFT JOIN users su ON s.user_id = su.id
    WHERE e.month = ? AND e.year = ?`;
  let params = [m, y];

  if (role === 'representative' && req.user.rep_id) {
    query += ' AND e.representative_id = ?';
    params.push(req.user.rep_id);
  } else if (role === 'seller' && req.user.seller_id) {
    query += ' AND e.seller_id = ?';
    params.push(req.user.seller_id);
  } else if (rep_id) {
    query += ' AND e.representative_id = ?';
    params.push(parseInt(rep_id));
  }

  if (type) {
    query += ' AND e.type = ?';
    params.push(type);
  }

  query += ' ORDER BY e.created_at DESC';
  res.json(db.prepare(query).all(...params));
});

router.post('/', (req, res) => {
  const { type, category, description, amount, month, year, week, destination, representative_id, seller_id } = req.body;
  const result = db.prepare(`INSERT INTO expenses (type, category, description, amount, month, year, week, destination, representative_id, seller_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(type, category, description, amount, month, year, week, destination, representative_id, seller_id);
  try {
    const actorName = req.user.name || req.user.email;
    createNotification(db, {
      type: 'expense',
      title: '💸 Novo gasto registrado',
      body: `${actorName} registrou ${category || type}: R$ ${Number(amount||0).toLocaleString('pt-BR', {minimumFractionDigits:2})}`,
      source: 'expenses', source_id: result.lastInsertRowid,
      actor_id: req.user.id, actor_name: actorName,
    });
  } catch(e) {}
  res.json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const { category, description, amount, week, destination } = req.body;
  db.prepare(`UPDATE expenses SET category=?, description=?, amount=?, week=?, destination=? WHERE id=?`)
    .run(category, description, amount, week, destination, req.params.id);
  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Summary by category
router.get('/summary', (req, res) => {
  const { month, year } = req.query;
  const m = parseInt(month) || new Date().getMonth() + 1;
  const y = parseInt(year) || new Date().getFullYear();
  let repFilter = '';
  const params = [m, y];
  if (req.user.role === 'representative' && req.user.rep_id) {
    repFilter = ' AND representative_id = ?';
    params.push(req.user.rep_id);
  }
  const data = db.prepare(`SELECT category, type, SUM(amount) as total FROM expenses WHERE month = ? AND year = ?${repFilter} GROUP BY category, type ORDER BY total DESC`).all(...params);
  res.json(data);
});

module.exports = router;
