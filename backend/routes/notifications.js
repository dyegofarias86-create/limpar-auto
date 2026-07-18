const express = require('express');
const router  = express.Router();
const { db } = require('../db/schema');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// Helper: create notification (used by other routes)
function createNotification(db, { type = 'info', title, body, source, source_id, actor_id, actor_name }) {
  db.prepare(`
    INSERT INTO notifications (type, title, body, source, source_id, actor_id, actor_name)
    VALUES (?,?,?,?,?,?,?)
  `).run(type, title, body || '', source || '', source_id || null, actor_id || null, actor_name || '');
}

module.exports.createNotification = createNotification;

// GET /api/notifications — list recent (last 50), with unread count
router.get('/', (req, res) => {
  
  const userId = String(req.user.id);
  const rows = db.prepare(`
    SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50
  `).all();

  const enriched = rows.map(n => {
    const readBy = JSON.parse(n.read_by || '[]');
    return { ...n, read: readBy.includes(userId) };
  });

  const unread = enriched.filter(n => !n.read).length;
  res.json({ notifications: enriched, unread });
});

// POST /api/notifications/:id/read — mark as read
router.post('/:id/read', (req, res) => {
  
  const userId = String(req.user.id);
  const row = db.prepare('SELECT read_by FROM notifications WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });

  const readBy = JSON.parse(row.read_by || '[]');
  if (!readBy.includes(userId)) readBy.push(userId);
  db.prepare('UPDATE notifications SET read_by=? WHERE id=?').run(JSON.stringify(readBy), req.params.id);
  res.json({ ok: true });
});

// POST /api/notifications/read-all
router.post('/read-all', (req, res) => {
  
  const userId = String(req.user.id);
  const rows = db.prepare('SELECT id, read_by FROM notifications').all();
  const stmt = db.prepare('UPDATE notifications SET read_by=? WHERE id=?');
  rows.forEach(row => {
    const readBy = JSON.parse(row.read_by || '[]');
    if (!readBy.includes(userId)) {
      readBy.push(userId);
      stmt.run(JSON.stringify(readBy), row.id);
    }
  });
  res.json({ ok: true });
});

router.get('/', (req, res) => res.json([]));

module.exports.router = router;
