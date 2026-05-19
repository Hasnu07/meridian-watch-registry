'use strict';

const express = require('express');
const bcrypt  = require('bcrypt');
const db      = require('../db');

const router = express.Router();

// POST /api/auth/login  { username, password }
router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const user = db.getUserByUsername(username.trim());
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  req.session.authenticated = true;
  req.session.user = { id: user.id, username: user.username, role: user.role };
  res.json({ ok: true, user: req.session.user });
});

// GET /api/auth/me — who is the current session?
router.get('/me', (req, res) => {
  if (!req.session?.authenticated || !req.session?.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  res.json(req.session.user);
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

module.exports = router;
