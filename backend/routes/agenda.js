const express = require('express');
const { db } = require('../db/schema');
const { authMiddleware } = require('../middleware/auth');
const { createNotification } = require('./notifications');
const router = express.Router();
router.use(authMiddleware);

router.get('/', (req, res) => {
  const { month, year, rep_id } = req.query;
  const m = parseInt(month) || new Date().getMonth() + 1;
  const y = parseInt(year)  || new Date().getFullYear();

  let repCond = '';
  const params = [m, y];
  const rid = rep_id || (req.user.role === 'representative' ? req.user.rep_id : null);
  if (rid) { repCond = ' AND ae.representative_id = ?'; params.push(parseInt(rid)); }

  const events = db.prepare(`
    SELECT ae.*, u.name as rep_name,
      c.store_name as client_store, c.group_name as client_group
    FROM agenda_events ae
    JOIN representatives r ON ae.representative_id = r.id
    JOIN users u ON r.user_id = u.id
    LEFT JOIN clients c ON ae.client_id = c.id
    WHERE ae.month = ? AND ae.year = ?${repCond}
    ORDER BY ae.date, ae.time
  `).all(...params);

  res.json(events);
});

router.post('/', (req, res) => {
  const {
    representative_id, client_id, date, time, duration, week, month, year,
    client_name, title, visit_report, difficulties, action_plan
  } = req.body;

  let resolvedClientName = client_name;
  if (client_id && !resolvedClientName) {
    const c = db.prepare('SELECT store_name FROM clients WHERE id = ?').get(client_id);
    resolvedClientName = c?.store_name || '';
  }

  const result = db.prepare(`
    INSERT INTO agenda_events
      (representative_id, client_id, date, time, duration, week, month, year, client_name, title, visit_report, difficulties, action_plan)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    representative_id, client_id || null, date,
    time || '09:00', duration || 60,
    week || null, month, year,
    resolvedClientName || '', title || '', visit_report || '', difficulties || '', action_plan || ''
  );

  // Notify
  try {
    const repName = req.user.name || req.user.email;
    createNotification(db, {
      type: 'agenda',
      title: '📅 Nova visita agendada',
      body: `${repName} agendou visita${resolvedClientName ? ' para ' + resolvedClientName : ''} em ${date}`,
      source: 'agenda',
      source_id: result.lastInsertRowid,
      actor_id: req.user.id,
      actor_name: repName,
    });
  } catch(e) { /* non-critical */ }

  res.json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const { client_id, client_name, title, date, time, duration, week, visit_report, difficulties, action_plan } = req.body;

  let resolvedClientName = client_name;
  if (client_id && !resolvedClientName) {
    const c = db.prepare('SELECT store_name FROM clients WHERE id = ?').get(client_id);
    resolvedClientName = c?.store_name || '';
  }

  db.prepare(`
    UPDATE agenda_events
    SET client_id=?, client_name=?, title=?, date=?, time=?, duration=?, week=?,
        visit_report=?, difficulties=?, action_plan=?
    WHERE id=?
  `).run(
    client_id || null, resolvedClientName || '', title || '', date,
    time || '09:00', duration || 60, week || null,
    visit_report || '', difficulties || '', action_plan || '',
    req.params.id
  );
  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM agenda_events WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
