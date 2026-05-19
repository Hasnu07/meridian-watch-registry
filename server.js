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

app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname, 'public')));

// Auth guard — also makes the session user info easy to read downstream
function requireAuth(req, res, next) {
  if (req.session?.authenticated && req.session?.user) return next();
  res.status(401).json({ error: 'Unauthorised' });
}

const uid = req => req.session.user.id;

// ── Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));

app.use('/api/shops',                             requireAuth, require('./routes/shops'));
app.use('/api/portfolios',                        requireAuth, require('./routes/portfolios'));
app.use('/api/clients',                           requireAuth, require('./routes/clients'));
app.use('/api/_restore',                          require('./routes/restore'));
app.use('/api/profiles',                          requireAuth, require('./routes/profiles'));
app.use('/api/profiles/:id/company-docs',         requireAuth, require('./routes/company-docs'));
app.use('/api/watches',                           requireAuth, require('./routes/watches'));
app.use('/api',                                   requireAuth, require('./routes/loss-payments'));

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

// Stats — scoped to current user
app.get('/api/stats', requireAuth, (req, res) => {
  res.json(db.getStats(uid(req)));
});

// Change password — updates the CURRENT user (not the legacy admin row)
app.post('/api/settings/password', requireAuth, async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'current_password and new_password required' });
  }
  if (new_password.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }

  const user = db.getUserByUsername(req.session.user.username);
  if (!user) return res.status(401).json({ error: 'User not found' });

  const ok = await bcrypt.compare(current_password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Current password is incorrect' });

  const newHash = await bcrypt.hash(new_password, 10);
  db.setUserPassword(user.id, newHash);
  res.json({ ok: true });
});

// ── App Settings (per-user GreenAPI etc.) ────────────────────────────────
const ALLOWED_SETTINGS = ['greenapi_api_url','greenapi_instance_id','greenapi_api_token','greenapi_group_id','greenapi_notify_hour'];

app.get('/api/settings', requireAuth, (req, res) => {
  const all = db.getAllSettings(uid(req));
  if (all.greenapi_api_token) all.greenapi_api_token = '••••••••';
  res.json(all);
});

app.post('/api/settings', requireAuth, (req, res) => {
  for (const key of ALLOWED_SETTINGS) {
    if (req.body[key] !== undefined && req.body[key] !== '') {
      db.setSetting(uid(req), key, req.body[key]);
    }
  }
  scheduleCron();
  res.json({ ok: true });
});

// Manual trigger — only sends for the calling user's settings/group
app.post('/api/settings/whatsapp/trigger', requireAuth, async (req, res) => {
  const result = await notifier.checkAndNotifyForUser(uid(req), { force: false });
  res.json(result);
});

app.post('/api/settings/whatsapp/test', requireAuth, async (req, res) => {
  const result = await notifier.checkAndNotifyForUser(uid(req), { force: true });
  res.json(result);
});

// Protected dashboard
app.get('/dashboard', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('[ERROR]', err.stack || err.message || err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// ── WhatsApp wishlist cron — fires every user's reminders separately ─────
let _cronJob = null;

function scheduleCron() {
  if (_cronJob) { _cronJob.stop(); _cronJob = null; }
  // Use any user's configured hour as the schedule time, falling back to 09.
  // (Cron fires once per day; inside the callback we iterate all users.)
  const users = db.listUsers();
  let hour = 9;
  for (const u of users) {
    const h = db.getSetting(u.id, 'greenapi_notify_hour');
    if (h != null && h !== '') { hour = Math.max(0, Math.min(23, parseInt(h, 10) || 9)); break; }
  }
  _cronJob = cron.schedule(`0 ${hour} * * *`, async () => {
    console.log(`[WhatsApp] Daily wishlist check at ${hour}:00`);
    for (const u of db.listUsers()) {
      const result = await notifier.checkAndNotifyForUser(u.id);
      if (result.sent)        console.log(`[WhatsApp] [${u.username}] sent ${result.count} reminder(s)`);
      else if (result.error)  console.warn(`[WhatsApp] [${u.username}] error: ${result.error}`);
    }
  });
  console.log(`[WhatsApp] Daily reminder scheduled at ${hour}:00 (fans out to all users)`);
}

scheduleCron();

app.listen(PORT, () => {
  console.log(`Meridian Watch Registry running at http://localhost:${PORT}`);
});
