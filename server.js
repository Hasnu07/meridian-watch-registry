'use strict';

require('dotenv').config();

const express   = require('express');
const session   = require('express-session');
const path      = require('path');
const bcrypt    = require('bcrypt');
const cron      = require('node-cron');
const db        = require('./db');
const notifier  = require('./lib/wishlist-notifier');
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
app.use('/api/clients',                           requireAuth, require('./routes/clients'));
app.use('/api/_restore',                          require('./routes/restore')); // TEMP — remove after use
app.use('/api/profiles',                          requireAuth, require('./routes/profiles'));
app.use('/api/profiles/:id/company-docs',         requireAuth, require('./routes/company-docs'));
app.use('/api/watches',                           requireAuth, require('./routes/watches'));

// ── Public portfolio share ────────────────────────────────────────────────
app.get('/p/:token', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'portfolio-share.html'));
});

app.get('/api/share/:token', (req, res) => {
  const portfolio = db.getPortfolioByToken(req.query.token || req.params.token);
  if (!portfolio) return res.status(404).json({ error: 'Invalid or expired link' });
  const clients = db.listProfilesForPortfolio(portfolio.id).map(p => ({
    ...p,
    watches: db.listWatchesForProfile(p.id),
  }));
  res.json({ portfolio, clients });
});

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

// ── App Settings (GreenAPI etc.) ─────────────────────────────────────────
const ALLOWED_SETTINGS = ['greenapi_api_url','greenapi_instance_id','greenapi_api_token','greenapi_group_id','greenapi_notify_hour'];

app.get('/api/settings', requireAuth, (req, res) => {
  const all = db.getAllSettings();
  // Never expose API token in plaintext — mask it
  if (all.greenapi_api_token) all.greenapi_api_token = '••••••••';
  res.json(all);
});

app.post('/api/settings', requireAuth, (req, res) => {
  for (const key of ALLOWED_SETTINGS) {
    if (req.body[key] !== undefined && req.body[key] !== '') {
      db.setSetting(key, req.body[key]);
    }
  }
  // Re-register cron whenever hour setting changes
  scheduleCron();
  res.json({ ok: true });
});

// Manual trigger — send wishlist reminder right now
app.post('/api/settings/whatsapp/trigger', requireAuth, async (req, res) => {
  const result = await notifier.checkAndNotify({ force: false });
  res.json(result);
});

// Test message — always sends regardless of milestones
app.post('/api/settings/whatsapp/test', requireAuth, async (req, res) => {
  const result = await notifier.checkAndNotify({ force: true });
  res.json(result);
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

// ── WhatsApp wishlist cron ────────────────────────────────────────────────
let _cronJob = null;

function scheduleCron() {
  if (_cronJob) { _cronJob.stop(); _cronJob = null; }
  const hourStr = db.getSetting('greenapi_notify_hour') || '09';
  const hour    = Math.max(0, Math.min(23, parseInt(hourStr, 10) || 9));
  // Run daily at the configured hour (minute 0)
  _cronJob = cron.schedule(`0 ${hour} * * *`, async () => {
    console.log(`[WhatsApp] Running wishlist milestone check (${hour}:00)…`);
    const result = await notifier.checkAndNotify();
    if (result.sent)  console.log(`[WhatsApp] Sent — ${result.count} milestone watch(es).`);
    else if (result.error) console.warn(`[WhatsApp] Error: ${result.error}`);
    else console.log('[WhatsApp] No milestone watches today.');
  });
  console.log(`[WhatsApp] Scheduled daily wishlist reminder at ${hour}:00`);
}

// Kick off on startup
scheduleCron();

// ── Start ─────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Meridian Watch Registry running at http://localhost:${PORT}`);
});
