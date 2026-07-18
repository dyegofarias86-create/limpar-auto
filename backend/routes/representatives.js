const express = require('express');
const { db } = require('../db/schema');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();
router.use(authMiddleware);

router.get('/', (req, res) => {
  // Include the leader's own representative record if it exists
  const reps = db.prepare(`
    SELECT r.id, u.name, u.email, u.active,
      (SELECT COUNT(*) FROM sellers s WHERE s.representative_id = r.id) as seller_count,
      (SELECT COUNT(*) FROM clients c WHERE c.representative_id = r.id) as client_count
    FROM representatives r JOIN users u ON r.user_id = u.id
    WHERE (r.leader_id = ? OR r.user_id = ?) AND u.active = 1
    ORDER BY u.name
  `).all(req.user.id, req.user.id);

  // Enrich with states and cities
  reps.forEach(rep => {
    const states = db.prepare(`SELECT DISTINCT UPPER(TRIM(state)) as state FROM clients WHERE representative_id = ? AND state != '' ORDER BY state`).all(rep.id).map(r => r.state).filter(Boolean);
    const cities = db.prepare(`SELECT DISTINCT UPPER(TRIM(city)) as city, UPPER(TRIM(state)) as state FROM clients WHERE representative_id = ? AND city != '' ORDER BY state, city LIMIT 20`).all(rep.id);
    rep.states = states;
    rep.top_cities = cities;
  });
  res.json(reps);
});

router.get('/:id/details', (req, res) => {
  const { id } = req.params;
  const { month = new Date().getMonth()+1, year = new Date().getFullYear() } = req.query;

  const rep = db.prepare(`SELECT r.id, u.name, u.email FROM representatives r JOIN users u ON r.user_id = u.id WHERE r.id = ?`).get(id);
  if (!rep) return res.status(404).json({ error: 'Representante não encontrado' });

  const sellers = db.prepare(`SELECT s.id, u.name, u.email FROM sellers s JOIN users u ON s.user_id = u.id WHERE s.representative_id = ?`).all(id);
  const clients = db.prepare(`SELECT * FROM clients WHERE representative_id = ?`).all(id);
  
  const expenses = db.prepare(`SELECT category, SUM(amount) as total FROM expenses WHERE representative_id = ? AND month = ? AND year = ? GROUP BY category`).all(id, month, year);
  const billing = db.prepare(`SELECT COALESCE(SUM(total),0) as total, COALESCE(SUM(qty),0) as tmo FROM billing WHERE representative_id = ? AND month = ? AND year = ?`).get(id, month, year);
  const provisions = db.prepare(`SELECT COALESCE(SUM(current_balance),0) as balance FROM provisions WHERE representative_id = ? AND month = ? AND year = ?`).get(id, month, year);
  const mkt = db.prepare(`SELECT * FROM marketing_budget WHERE representative_id = ? AND month = ? AND year = ?`).get(id, month, year);

  res.json({ rep, sellers, clients, expenses, billing, provisions, marketing: mkt });
});

module.exports = router;
