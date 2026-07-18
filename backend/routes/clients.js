const express = require('express');
const { db } = require('../db/schema');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();
router.use(authMiddleware);

router.get('/', (req, res) => {
  const { rep_id, active } = req.query;
  let cond = 'WHERE 1=1';
  const params = [];
  const rid = rep_id || (req.user.role !== 'leader' ? req.user.rep_id : null);
  if (rid) { cond += ' AND representative_id = ?'; params.push(rid); }
  if (active !== undefined) { cond += ' AND active = ?'; params.push(active === 'true' ? 1 : 0); }
  const clients = db.prepare(`SELECT * FROM clients ${cond} ORDER BY group_name, store_name`).all(...params);
  res.json(clients);
});

router.post('/', (req, res) => {
  const { group_name, dealer_name, store_name, brand, state, city, cnpj, email, representative_id, seller_id, provision_per_tmo } = req.body;
  const result = db.prepare(`INSERT INTO clients (group_name, dealer_name, store_name, brand, state, city, cnpj, email, representative_id, seller_id, provision_per_tmo) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(group_name, dealer_name, store_name, brand, state, city, cnpj, email, representative_id, seller_id, provision_per_tmo || 0);
  res.json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const { group_name, dealer_name, store_name, brand, state, city, cnpj, email, active, provision_per_tmo, representative_id } = req.body;
  db.prepare(`UPDATE clients SET group_name=?, dealer_name=?, store_name=?, brand=?, state=?, city=?, cnpj=?, email=?, active=?, provision_per_tmo=?, representative_id=? WHERE id=?`)
    .run(group_name, dealer_name, store_name, brand, state, city, cnpj, email, active ? 1 : 0, provision_per_tmo, representative_id || null, req.params.id);
  res.json({ success: true });
});

module.exports = router;

// Bulk reassign clients to another representative
router.post('/reassign', (req, res) => {
  const { client_ids, representative_id } = req.body;
  if (!client_ids?.length || !representative_id) return res.status(400).json({ error: 'Parâmetros inválidos' });
  
  const stmt = db.prepare('UPDATE clients SET representative_id = ? WHERE id = ?');
  let updated = 0;
  client_ids.forEach(id => { stmt.run(representative_id, id); updated++; });
  res.json({ success: true, updated });
});
