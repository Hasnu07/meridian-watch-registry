'use strict';

require('dotenv').config();

const express = require('express');
const session = require('express-session');
const path    = require('path');
const bcrypt  = require('bcrypt');
const db      = require('./db');
const { UPLOADS_DIR } = require('./config');

// ── Initialise database ───────────────────────────────────────────────────
db.init();

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret:            process.env.SESSION_SECRET || 'fallback-secret',
  resave:            false,
  saveUninitialized: false,
  cookie:            { httpOnly: true, maxAge: 8 * 60 * 60 * 1000 }, // 8 h
}));

// Serve uploaded files
app.use('/uploads', express.static(UPLOADS_DIR));

// Serve public files (login page, etc.)
app.use(express.static(path.join(__dirname, 'public')));

// ── Auth guard for all /api routes except login ───────────────────────────
function requireAuth(req, res, next) {
  if (req.session?.authenticated) return next();
  res.status(401).json({ error: 'Unauthorised' });
}

// ── Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));

app.use('/api/shops',                             requireAuth, require('./routes/shops'));
app.use('/api/portfolios',                        requireAuth, require('./routes/portfolios'));
app.use('/api/_restore',                          require('./routes/restore')); // TEMP — remove after use
app.use('/api/profiles',                          requireAuth, require('./routes/profiles'));
app.use('/api/profiles/:id/company-docs',         requireAuth, require('./routes/company-docs'));
app.use('/api/watches',                           requireAuth, require('./routes/watches'));

// Stats endpoint
app.get('/api/stats', requireAuth, (req, res) => {
  res.json(db.getStats());
});

// Change admin password
app.post('/api/settings/password', requireAuth, async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'current_password and new_password required' });
  }
  if (new_password.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }

  const hash = db.getAdminHash();
  const ok   = await bcrypt.compare(current_password, hash);
  if (!ok) return res.status(401).json({ error: 'Current password is incorrect' });

  const newHash = await bcrypt.hash(new_password, 10);
  db.setAdminPassword(newHash);
  res.json({ ok: true });
});

// Protected dashboard — serve dashboard.html for any non-API route when authed
app.get('/dashboard', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Fallback: redirect to login
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global error handler — returns JSON instead of Express HTML error page
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.stack || err.message || err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Meridian Watch Registry running at http://localhost:${PORT}`);
});
