'use strict';

/**
 * Boutique manager — read-only window onto ONE shop of the owner's registry.
 *
 * Mounted at /api before every other authenticated router. For any user who
 * is not a boutique_manager it steps aside (`next('router')`) and the normal
 * routers handle the request. For a boutique manager it answers the handful
 * of GET endpoints the restricted dashboard needs — always filtered to their
 * shop and stripped of the operator's internals — and refuses everything else
 * with 403, so no write and no other page can be reached even by hand.
 *
 * What a boutique manager may see about a watch: model, reference / serial /
 * movement / case numbers, source, whether it is still on the wishlist or has
 * been handed over (never purchased vs sold), dates, list price, image, notes,
 * which client (membership) it belongs to, and the COMMISSION the owner chose
 * to share with them (expenses of category 'commission' flagged for_boutique;
 * their Commissions tab lists these). Never: stock number, the resale price,
 * who bought it, costs, payouts, loss settlements, split rules or capital.
 */

const express = require('express');
const db      = require('../db');

const router = express.Router();

const READ_ONLY_MSG = 'Boutique managers can only view their own shop.';

router.use((req, res, next) => {
  if (req.session?.user?.role !== 'boutique_manager') return next('router');
  req.bm = { ownerId: req.session.user.owner_id, shopId: req.session.user.shop_id };
  if (!req.bm.ownerId) return res.status(403).json({ error: 'This boutique manager account is not linked to a registry.' });
  next();
});

// ── Sanitisers ──────────────────────────────────────────────────────────────

// Only commissions the owner chose to share (for_boutique) — see routes/expenses.js
function commissionOf(watchId) {
  const rows = db.listExpenses(watchId).filter(e => e.category === 'commission' && !e.reversed && e.for_boutique);
  const byCur = {};
  for (const e of rows) byCur[e.currency || 'CHF'] = (byCur[e.currency || 'CHF'] || 0) + Number(e.amount || 0);
  return {
    entries: rows.map(e => ({ id: e.id, date: e.date, amount: e.amount, currency: e.currency || 'CHF', description: e.description, category: e.category })),
    byCur,
  };
}

function sanitizeWatch(w) {
  const c = commissionOf(w.id);
  const curs = Object.keys(c.byCur);
  return {
    id:               w.id,
    profile_id:       w.profile_id,
    model:            w.model,
    reference_number: w.reference_number,
    serial_number:    w.serial_number,
    movement_number:  w.movement_number,
    case_number:      w.case_number,
    source:           w.source,
    // The boutique never learns whether a piece was resold: it is either still
    // on the wishlist or it has been handed over to the client.
    status:           w.status === 'wishlist' ? 'wishlist' : 'handed_over',
    currency:         w.currency,
    list_price:       w.list_price,
    purchase_date:    w.purchase_date,
    market_price_date: w.market_price_date,   // the deal date (drives "sold this month"); the price itself is not sent
    created_at:       w.created_at,
    image_path:       w.image_path,
    notes:            w.notes,
    client_name:      w.client_name,
    shop_name:        w.shop_name,
    // Commission recorded on this piece
    commission:          curs.length ? Object.values(c.byCur).reduce((a, b) => a + b, 0) : null,
    commission_currency: curs.length === 1 ? curs[0] : (curs[0] || null),
    commission_by_currency: c.byCur,
    expenses:            c.entries,
  };
}

function sanitizeProfile(p) {
  return {
    id:             p.id,
    name:           p.name,
    email:          p.email,
    photo_path:     p.photo_path,
    subscriber_id:  p.subscriber_id,
    pp_urn:         p.pp_urn,
    shop_id:        p.shop_id,
    shop_name:      p.shop_name,
    portfolio_id:   p.portfolio_id,
    portfolio_name: p.portfolio_name,
    client_id:      p.client_id,
    created_at:     p.created_at,
    watch_count:    p.watch_count,
  };
}

function sanitizeShop(s) {
  return { id: s.id, name: s.name, address: s.address, created_at: s.created_at, client_count: s.client_count };
}

function sanitizePortfolio(pt) {
  return { id: pt.id, name: pt.name, shop_id: pt.shop_id, client_count: pt.client_count, watch_count: pt.watch_count, created_at: pt.created_at };
}

// A sanitised profile list with full watch rows (for shop detail expand rows)
function profileWithWatches(p, ownerId) {
  return { ...sanitizeProfile(p), watches: db.listWatchesForProfile(p.id, ownerId).map(w => sanitizeWatch({ ...w, client_name: p.name, shop_name: p.shop_name })) };
}

function myShop(req) {
  return req.bm.shopId ? db.getShop(req.bm.shopId, req.bm.ownerId) : null;
}

function shopWatches(req, q) {
  if (!req.bm.shopId) return [];
  return db.listAllWatches({ q, shop_id: req.bm.shopId, ownerId: req.bm.ownerId }).map(sanitizeWatch);
}

// ── Endpoints ──────────────────────────────────────────────────────────────

// Stats for the Vault / Watches tiles — counts, list values and commission only
router.get('/stats', (req, res) => {
  const watches = shopWatches(req);
  const byCur = (list, fn) => {
    const m = {};
    for (const w of list) { const v = fn(w); if (v) m[w.currency || 'CHF'] = (m[w.currency || 'CHF'] || 0) + Number(v); }
    return m;
  };
  const commission_total = {};
  for (const w of watches) for (const [cur, v] of Object.entries(w.commission_by_currency || {})) commission_total[cur] = (commission_total[cur] || 0) + v;
  res.json({
    total_profiles:      new Set(watches.map(w => w.profile_id)).size,
    total_watches:       watches.length,
    wishlist_count:      watches.filter(w => w.status === 'wishlist').length,
    handed_over_count:   watches.filter(w => w.status === 'handed_over').length,
    handed_over_list_value: byCur(watches.filter(w => w.status === 'handed_over'), w => w.list_price),
    wishlist_list_value: byCur(watches.filter(w => w.status === 'wishlist'),  w => w.list_price),
    commission_total,
    commission_pieces:   watches.filter(w => w.commission != null).length,
    // Kept as empty maps / zeros so shared renderers show '—' rather than crash
    purchased_count: 0, sold_count: 0, active_list_value: {},
    total_sale_value: {}, net_pnl: {}, my_total_cost: {}, client_total_cost: {}, total_value: {},
  });
});

router.get('/shops', (req, res) => {
  const shop = myShop(req);
  if (!shop) return res.json([]);
  const full = db.listShops(req.bm.ownerId).find(s => s.id === shop.id) || shop;
  res.json([sanitizeShop(full)]);
});

router.get('/shops/:id', (req, res) => {
  const shop = myShop(req);
  if (!shop || Number(req.params.id) !== shop.id) return res.status(404).json({ error: 'Not found' });
  res.json({ ...sanitizeShop(shop), profiles: db.listProfilesForShop(shop.id, req.bm.ownerId).map(sanitizeProfile) });
});

router.get('/shops/:id/individual-clients', (req, res) => {
  const shop = myShop(req);
  if (!shop || Number(req.params.id) !== shop.id) return res.status(404).json({ error: 'Not found' });
  res.json(db.listIndividualProfilesForShop(shop.id, req.bm.ownerId).map(p => sanitizeProfile({ ...p, shop_name: shop.name })));
});

router.get('/portfolios', (req, res) => {
  const shop = myShop(req);
  if (!shop || Number(req.query.shop_id) !== shop.id) return res.json([]);
  res.json(db.listPortfolios(shop.id, req.bm.ownerId).map(sanitizePortfolio));
});

router.get('/profiles', (req, res) => {
  const shop = myShop(req);
  if (!shop) return res.json([]);
  res.json(db.listProfilesForShop(shop.id, req.bm.ownerId).map(p => sanitizeProfile({ ...p, shop_name: shop.name })));
});

router.get('/profiles/:id', (req, res) => {
  const shop = myShop(req);
  const p = shop && db.getProfile(req.params.id, req.bm.ownerId);
  if (!p || p.shop_id !== shop.id) return res.status(404).json({ error: 'Not found' });
  res.json(profileWithWatches(p, req.bm.ownerId));
});

router.get('/watches', (req, res) => {
  res.json(shopWatches(req, req.query.q));
});

router.get('/watches/:id', (req, res) => {
  const shop = myShop(req);
  const w = shop && db.getWatch(req.params.id, req.bm.ownerId);
  const p = w && db.getProfile(w.profile_id, req.bm.ownerId);
  if (!w || !p || p.shop_id !== shop.id) return res.status(404).json({ error: 'Not found' });
  res.json({ ...sanitizeWatch({ ...w, client_name: p.name, shop_name: p.shop_name }), profile: sanitizeProfile(p) });
});

// Everything else — every write, every other page's data — is off limits
router.use((req, res) => res.status(403).json({ error: READ_ONLY_MSG }));

module.exports = router;
