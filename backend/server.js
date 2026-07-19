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
  app.use(express.static(frontendDist));
  // SPA fallback — all non-API routes serve index.html
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 LimpAr API rodando em http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health`);
});

// One-time cleanup endpoint (protected by token)
app.post('/api/admin/cleanup-dupes', (req, res) => {
  const { token } = req.body;
  if (token !== 'limpar-cleanup-2026') return res.status(403).json({ error: 'forbidden' });
  try {
    const { db } = require('./db/schema');
    // Fix duplicate expenses: keep only most recent per rep/month/year/category
    const cats = db.prepare('SELECT DISTINCT representative_id, month, year, category FROM expenses').all();
    let deleted = 0;
    for (const c of cats) {
      const rows = db.prepare('SELECT id FROM expenses WHERE representative_id=? AND month=? AND year=? AND category=? ORDER BY id DESC').all(c.representative_id, c.month, c.year, c.category);
      if (rows.length > 1) {
        const toDelete = rows.slice(1).map(r => r.id);
        for (const id of toDelete) { db.prepare('DELETE FROM expenses WHERE id=?').run(id); deleted++; }
      }
    }
    const remaining = db.prepare('SELECT COUNT(*) as n FROM expenses').get();
    res.json({ success: true, deleted, remaining: remaining.n });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
