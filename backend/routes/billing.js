const express = require('express');
const { db } = require('../db/schema');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();
router.use(authMiddleware);

router.get('/', (req, res) => {
  const { month, months, year, rep_id } = req.query;
  const y = parseInt(year) || new Date().getFullYear();
  // Support multiple months: ?months=1,2,3 or single ?month=7
  const monthList = months
    ? months.split(',').map(Number).filter(n => n >= 1 && n <= 12)
    : [parseInt(month) || new Date().getMonth() + 1];

  let repCond = '';
  const rid = rep_id || (req.user.role !== 'leader' ? req.user.rep_id : null);
  if (rid) { repCond = ' AND b.representative_id = ?'; }

  const placeholders = monthList.map(() => '?').join(',');
  const params = [...monthList, y, ...(rid ? [rid] : [])];

  const data = db.prepare(`
    SELECT b.*, c.store_name, c.group_name, c.brand, c.city, c.state, c.email as client_email,
      u.name as rep_name
    FROM billing b
    JOIN clients c ON b.client_id = c.id
    JOIN representatives r ON b.representative_id = r.id
    JOIN users u ON r.user_id = u.id
    WHERE b.month IN (${placeholders}) AND b.year = ?${repCond}
    ORDER BY b.month, c.group_name, c.store_name
  `).all(...params);
  res.json(data);
});

router.get('/by-product', (req, res) => {
  const { month, year } = req.query;
  const m = parseInt(month) || new Date().getMonth() + 1;
  const y = parseInt(year) || new Date().getFullYear();
  const data = db.prepare(`SELECT product, SUM(qty) as tmo, SUM(total) as total FROM billing WHERE month = ? AND year = ? GROUP BY product ORDER BY total DESC`).all(m, y);
  res.json(data);
});

router.get('/by-rep', (req, res) => {
  const { month, year } = req.query;
  const m = parseInt(month) || new Date().getMonth() + 1;
  const y = parseInt(year) || new Date().getFullYear();
  const data = db.prepare(`
    SELECT u.name, SUM(b.qty) as tmo, SUM(b.total) as total
    FROM billing b JOIN representatives r ON b.representative_id = r.id JOIN users u ON r.user_id = u.id
    WHERE b.month = ? AND b.year = ?
    GROUP BY r.id ORDER BY total DESC
  `).all(m, y);
  res.json(data);
});

router.post('/', (req, res) => {
  const { representative_id, seller_id, client_id, product, unit_price, qty, invoice_number, due_date, email_recipient, month, year } = req.body;
  const total = unit_price * qty;
  const result = db.prepare(`INSERT INTO billing (representative_id, seller_id, client_id, product, unit_price, qty, total, invoice_number, due_date, email_recipient, month, year) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(representative_id, seller_id, client_id, product, unit_price, qty, total, invoice_number, due_date, email_recipient, month, year);
  res.json({ id: result.lastInsertRowid });
});

router.patch('/:id/nf', (req, res) => {
  const { nf_issued, nf_sent } = req.body;
  db.prepare('UPDATE billing SET nf_issued = ?, nf_sent = ? WHERE id = ?').run(nf_issued ? 1 : 0, nf_sent ? 1 : 0, req.params.id);
  res.json({ success: true });
});

module.exports = router;
