'use strict';

/**
 * Shop collaborators — another admin/master working ONE shop of someone
 * else's registry alongside its owner.
 *
 * The owner names collaborators on the Boutique Commission page
 * (routes/shops.js: /shops/:id/collaborators). A collaborator then works that
 * shop from their own sign-in: the dashboard sends `X-Collab-Shop: <shopId>`
 * on every request made while that shop is chosen, and this middleware —
 * mounted at /api before every other authenticated router — checks the
 * collaboration, sets `req.collab` (so lib/uid.js resolves the request to the
 * shop owner's registry) and lets through ONLY what a collaborator may do:
 *
 *   view   the shop, its clients and its pieces (full detail, as the owner sees it)
 *   add    a piece to one of the shop's clients; edit a piece
 *   set    commissions on a piece, share / hide / void them
 *
 * Everything else under that header — selling, deleting, payouts, settlements,
 * other shops, clients, settings, users — is refused with 403, so a
 * collaborator can never reach past the shop even by hand. Without the
 * header the request is the user's own workspace, exactly as before.
 */

const express = require('express');
const db      = require('../db');

const router = express.Router();

const HEADER   = 'x-collab-shop';
const DENY_MSG = 'Collaborators can view this shop, add or edit its pieces and set commissions — nothing else.';

// Which shop a piece / client / expense sits in, within the owner's registry
function shopOfProfile(profileId, ownerId) {
  return db.getProfile(profileId, ownerId)?.shop_id ?? null;
}
function shopOfWatch(watchId, ownerId) {
  const w = db.getWatch(watchId, ownerId);
  return w ? shopOfProfile(w.profile_id, ownerId) : null;
}
function shopOfExpense(expenseId, ownerId) {
  const e = db.getExpense(expenseId);
  return e ? shopOfWatch(e.watch_id, ownerId) : null;
}

// What a collaborator may do, as [method, path pattern, check]. A check gets
// the match and the collaboration and answers true (go on), false (403) or
// null (404 — the thing is not in this shop, which is all they need to know).
const ALLOWED = [
  ['GET',  /^\/shops\/(\d+)$/,                 (m, c) => Number(m[1]) === c.shopId ? true : null],
  ['GET',  /^\/shops\/(\d+)\/collaborators$/,  (m, c) => Number(m[1]) === c.shopId ? true : null],
  ['GET',  /^\/watches$/,                      () => true],                     // forced to shop_id below
  ['GET',  /^\/watches\/(\d+)$/,               (m, c) => shopOfWatch(m[1], c.ownerId) === c.shopId ? true : null],
  ['PUT',  /^\/watches\/(\d+)$/,               (m, c) => shopOfWatch(m[1], c.ownerId) === c.shopId ? true : null],   // edit — not sell (routes/watches.js)
  ['GET',  /^\/watches\/(\d+)\/expenses$/,     (m, c) => shopOfWatch(m[1], c.ownerId) === c.shopId ? true : null],
  ['POST', /^\/watches\/(\d+)\/expenses$/,     (m, c) => shopOfWatch(m[1], c.ownerId) === c.shopId ? true : null],
  ['PUT',  /^\/expenses\/(\d+)\/boutique$/,    (m, c) => shopOfExpense(m[1], c.ownerId) === c.shopId ? true : null],
  ['POST', /^\/expenses\/(\d+)\/reverse$/,     (m, c) => shopOfExpense(m[1], c.ownerId) === c.shopId ? true : null],
  ['GET',  /^\/profiles\/(\d+)$/,              (m, c) => shopOfProfile(m[1], c.ownerId) === c.shopId ? true : null],
  ['POST', /^\/profiles\/(\d+)\/watches$/,     (m, c) => shopOfProfile(m[1], c.ownerId) === c.shopId ? true : null],
];

router.use((req, res, next) => {
  const raw = req.get(HEADER);
  if (raw == null || raw === '') return next('router');

  const u = req.session.user;
  const shopId = Number(raw);
  if (u.role === 'boutique_manager' || !Number.isInteger(shopId) || shopId <= 0) {
    return res.status(403).json({ error: 'You are not a collaborator on this shop.' });
  }
  const c = db.getCollaboration(shopId, u.id);
  if (!c) return res.status(403).json({ error: 'You are not a collaborator on this shop (or no longer).' });
  req.collab = { shopId, ownerId: c.owner_id };

  const p = req.path.replace(/\/+$/, '') || '/';

  // Answered here: the shop's own clients and managers, scoped without a shop_id filter elsewhere
  if (req.method === 'GET' && p === '/profiles') {
    const shop = db.getShop(shopId, c.owner_id);
    return res.json(shop ? db.listProfilesForShop(shopId, c.owner_id).map(x => ({ ...x, shop_name: shop.name })) : []);
  }
  if (req.method === 'GET' && p === '/boutique-managers') {
    return res.json(db.listBoutiqueManagers(c.owner_id).filter(m => m.shop_id === shopId));
  }

  for (const [method, re, check] of ALLOWED) {
    if (req.method !== method) continue;
    const m = p.match(re);
    if (!m) continue;
    const ok = check(m, req.collab);
    if (ok === null)  return res.status(404).json({ error: 'Not found in this shop' });
    if (ok === false) return res.status(403).json({ error: DENY_MSG });
    if (method === 'GET' && p === '/watches') req.query.shop_id = String(shopId);   // never the whole registry
    return next('router');
  }
  res.status(403).json({ error: DENY_MSG });
});

module.exports = router;
