'use strict';

const express = require('express');
const bcrypt  = require('bcrypt');
const db      = require('../db');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required' });

  const hash = db.getAdminHash();
  const ok   = await bcrypt.compare(password, hash);
  if (!ok) return res.status(401).json({ error: 'Invalid password' });

  req.session.authenticated = true;
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

module.exports = router;
