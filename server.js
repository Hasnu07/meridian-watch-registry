'use strict';

require('dotenv').config();

const express     = require('express');
const session     = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const rateLimit   = require('express-rate-limit');
const fs          = require('fs');
const crypto      = require('crypto');
const path        = require('path');
const bcrypt      = require('bcrypt');
const cron        = require('node-cron');
const db          = require('./db');
const notifier    = require('./lib/wishlist-notifier');
const seedDemo    = require('./lib/seed-demo-data');
const { UPLOADS_DIR } = require('./config');

// ── Initialise database ───────────────────────────────────────────────────
db.init();
try { seedDemo.run(db); } catch (e) { console.warn('[seed] demo data error:', e.message); }

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Session secret (auto-generate once if env var not set) ────────────────
// We never want to ship the literal 'fallback-secret'. If SESSION_SECRET
// isn't set we persist a generated 64-byte hex string to .session-secret
// the first time the server starts and reuse it on subsequent boots.
function loadOrCreateSessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const secretPath = path.join(__dirname, '.session-secret');
  try {
    if (fs.existsSync(secretPath)) {
      const s = fs.readFileSync(secretPath, 'utf8').trim();
      if (s.length >= 32) return s;
    }
  } catch {}
  const generated = crypto.randomBytes(64).toString('hex');
  try {
    fs.writeFileSync(secretPath, generated, { mode: 0o600 });
    console.log('[session] Generated new SESSION_SECRET → .session-secret (gitignore this file)');
  } catch (e) {
    console.warn('[session] Could not persist session secret:', e.message);
  }
  return generated;
}

// ── Middleware ────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Persistent session store — sessions survive server restarts
app.use(session({
  store:             new SQLiteStore({ db: 'sessions.sqlite', dir: __dirname }),
  secret:            loadOrCreateSessionSecret(),
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

// uid() respects the "view-as" impersonation flag a master may have set.
// Audit calls use req.session.user.id directly so actions stay attributable.
const uid = req => req.session.viewing_as || req.session.user.id;

// ── Routes ────────────────────────────────────────────────────────────────
// Rate-limit login attempts (per IP) to slow down brute-force attacks.
// 10 attempts / 15 min is plenty for legitimate typos and far below what
// a credential-stuffing bot needs.
const loginLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             10,
  standardHeaders: true,
  legacyHeaders:   false,
  message:         { error: 'Too many login attempts — please wait 15 minutes and try again.' },
});
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth', require('./routes/auth'));

// ── Public share routes ───────────────────────────────────────────────────
// IMPORTANT: these must be registered BEFORE the `/api` auth-gated mounts
// below (loss-payments / expenses / payouts use the bare `/api` prefix, which
// causes their `requireAuth` middleware to intercept any path starting with
// `/api/`, including our public `/api/share*` endpoints). Express matches
// middleware in registration order — by handling the public routes first they
// short-circuit before requireAuth gets a chance to 401 an unauthenticated
// recipient opening a share link in a fresh browser.
//
// The HTML page routes (/p/:token, /c/:token) aren't affected by this since
// no `/p` or `/c` middleware exists, but they're kept here for locality.

function sanitizeWatchForShare(w) {
  return {
    id:               w.id,
    model:            w.model,
    source:           w.source,
    serial_number:    w.serial_number,
    reference_number: w.reference_number,
    movement_number:  w.movement_number,
    case_number:      w.case_number,
    purchase_date:    w.purchase_date,
    sold_date:        w.sold_date,
    status:           w.status,
    currency:         w.currency,
    list_price:       w.list_price,
    sale_price:       w.status === 'sold' ? w.sale_price : null,
    image_path:       w.image_path,
    notes:            w.notes,
    // Deliberately omitted: my_cost, client_cost, my_received, client_received,
    // price, discount_rate_applied, loss_status, *_payout_status, sold_to,
    // and all ledger arrays (loss_payments, expenses, *_payouts).
  };
}
function sanitizeProfileForShare(p) {
  return {
    id:             p.id,
    name:           p.name,
    email:          p.email,
    subscriber_id:  p.subscriber_id,
    pp_urn:         p.pp_urn,
    address:        p.address,
    photo_path:     p.photo_path,
    shop_name:      p.shop_name,
    // Omitted: split rules, capital, trading_rule, my_capital, client_capital, etc.
  };
}

// Portfolio share — HTML + API
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

// Client share — HTML + API
app.get('/c/:token', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'client-share.html'));
});
app.get('/api/share-client/:token', (req, res) => {
  const client = db.getClientByToken(req.params.token);
  if (!client) return res.status(404).json({ error: 'Invalid or expired link' });
  const full = db.getClientWithMemberships(client.id, client.owner_id);
  if (!full) return res.status(404).json({ error: 'Invalid or expired link' });
  const memberships = (full.memberships || []).map(m => ({
    ...sanitizeProfileForShare(m),
    watches: (m.watches || []).map(sanitizeWatchForShare),
  }));
  res.json({
    client: { id: client.id, name: client.name, master_id: client.master_id, photo_path: client.photo_path },
    memberships,
  });
});

// ── Authenticated API mounts ──────────────────────────────────────────────
app.use('/api/shops',                             requireAuth, require('./routes/shops'));
app.use('/api/portfolios',                        requireAuth, require('./routes/portfolios'));
app.use('/api/clients',                           requireAuth, require('./routes/clients'));
app.use('/api/profiles',                          requireAuth, require('./routes/profiles'));
app.use('/api/profiles/:id/company-docs',         requireAuth, require('./routes/company-docs'));
app.use('/api/watches',                           requireAuth, require('./routes/watches'));
app.use('/api',                                   requireAuth, require('./routes/loss-payments'));
app.use('/api',                                   requireAuth, require('./routes/expenses'));
app.use('/api',                                   requireAuth, require('./routes/payouts'));
app.use('/api/admin',                             requireAuth, require('./routes/admin'));

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
  db.logAudit({ actorId: user.id, actorUsername: user.username, action: 'password_change', targetType: 'user', targetId: user.id, details: { self: true } });
  res.json({ ok: true });
});

// ── Patek Desk persistence (per-user, synced across devices) ──────────────
// The Patek Desk terminal previously stored its price list + FX in the
// browser's localStorage, which is per-device. Moving it to the per-user
// settings table makes the catalogue follow the account: log in from any PC
// and the same price list / FX rates load. Stored as a single JSON string
// under the key 'patek_desk_data'. The iframe runs same-origin inside the
// authenticated dashboard, so the session cookie authenticates these calls.
app.get('/api/patek-desk', requireAuth, (req, res) => {
  const value = db.getSetting(uid(req), 'patek_desk_data');
  res.json({ value: value ?? null });
});
app.put('/api/patek-desk', requireAuth, (req, res) => {
  const { value } = req.body;
  if (typeof value !== 'string') return res.status(400).json({ error: 'value (JSON string) required' });
  if (value.length > 2000000)   return res.status(413).json({ error: 'payload too large' });
  db.setSetting(uid(req), 'patek_desk_data', value);
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

// ── WhatsApp wishlist cron — independent schedule per user ───────────────
// Each user picks their own notify hour in Settings. We register one cron
// job per user so jhonny can fire at 09:00 and robin at 14:00 etc.
const _userCronJobs = new Map();  // userId → cron task

function scheduleCron() {
  // Tear down existing jobs
  for (const job of _userCronJobs.values()) job.stop();
  _userCronJobs.clear();

  for (const u of db.listUsers()) {
    const hourStr = db.getSetting(u.id, 'greenapi_notify_hour');
    if (hourStr == null || hourStr === '') continue;  // user hasn't configured a time
    const hour = Math.max(0, Math.min(23, parseInt(hourStr, 10) || 9));
    const job  = cron.schedule(`0 ${hour} * * *`, async () => {
      console.log(`[WhatsApp] [${u.username}] daily wishlist check at ${hour}:00`);
      const result = await notifier.checkAndNotifyForUser(u.id);
      if (result.sent)        console.log(`[WhatsApp] [${u.username}] sent ${result.count} reminder(s)`);
      else if (result.error)  console.warn(`[WhatsApp] [${u.username}] error: ${result.error}`);
    });
    _userCronJobs.set(u.id, job);
    console.log(`[WhatsApp] [${u.username}] daily reminder scheduled at ${hour}:00`);
  }
  if (_userCronJobs.size === 0) console.log('[WhatsApp] No users have configured a notify hour yet');
}

scheduleCron();

app.listen(PORT, () => {
  console.log(`Meridian Watch Registry running at http://localhost:${PORT}`);
});
