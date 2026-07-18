const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../db/schema');
const { JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email e senha obrigatórios' });

  const user = db.prepare('SELECT * FROM users WHERE email = ? AND active = 1').get(email);
  if (!user) return res.status(401).json({ error: 'Credenciais inválidas' });

  const valid = bcrypt.compareSync(password, user.password);
  if (!valid) return res.status(401).json({ error: 'Credenciais inválidas' });

  // Get representative or seller id
  let rep_id = null, seller_id = null;
  if (user.role === 'representative') {
    const rep = db.prepare('SELECT id FROM representatives WHERE user_id = ?').get(user.id);
    rep_id = rep?.id;
  }
  if (user.role === 'seller') {
    const seller = db.prepare('SELECT id FROM sellers WHERE user_id = ?').get(user.id);
    seller_id = seller?.id;
    const rep = db.prepare('SELECT representative_id FROM sellers WHERE user_id = ?').get(user.id);
    rep_id = rep?.representative_id;
  }

  const token = jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role, rep_id, seller_id },
    JWT_SECRET,
    { expiresIn: '8h' }
  );

  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, rep_id, seller_id } });
});

router.get('/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Não autenticado' });
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json(decoded);
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
});

module.exports = router;
