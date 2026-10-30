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
 *   view   the shop, its portfolios, clients and pieces (full detail, as the owner sees it)
 *   add    a client to the shop — new, or one of THEIR OWN clients (copied into
 *          the owner's registry on first use); add a piece to one of its clients
 *   edit   a piece; remove a piece
 *   set    commissions on a piece, share / hide / void them
 *
 * Everything they add or change lands in the owner's registry, so the owner
 * and the shop's boutique manager see it at once. Everything else under that
 * header — selling, payouts, settlements, portfolios, other shops, the
 * clients page, settings, users, collaborators — is refused with 403, so a
 * collaborator can never reach past the shop even by hand. Without the
 * header the request is the user's own workspace, exactly as before.
 */

const express = require('express');
const db      = require('../db');

const router = express.Router();

const HEADER   = 'x-collab-shop';
const DENY_MSG = 'Collaborators can view this shop, add clients and pieces to it, edit or remove a piece and set commissions — nothing else.';

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
const inShop   = (m, c) => Number(m[1]) === c.shopId ? true : null;
const watchIn  = (m, c) => shopOfWatch(m[1], c.ownerId) === c.shopId ? true : null;
const profIn   = (m, c) => shopOfProfile(m[1], c.ownerId) === c.shopId ? true : null;
const expIn    = (m, c) => shopOfExpense(m[1], c.ownerId) === c.shopId ? true : null;
const ALLOWED = [
  ['GET',    /^\/shops\/(\d+)$/,                     inShop],
  ['GET',    /^\/shops\/(\d+)\/individual-clients$/,  inShop],
  ['GET',    /^\/shops\/(\d+)\/collaborators$/,      inShop],
  ['GET',    /^\/portfolios$/,                       () => true],   // forced to shop_id below
  ['GET',    /^\/watches$/,                          () => true],   // forced to shop_id below
  ['GET',    /^\/watches\/(\d+)$/,                   watchIn],
  ['PUT',    /^\/watches\/(\d+)$/,                   watchIn],     // edit — not sell (routes/watches.js)
  ['DELETE', /^\/watches\/(\d+)$/,                   watchIn],     // remove a piece
  ['GET',    /^\/watches\/(\d+)\/expenses$/,         watchIn],
  ['POST',   /^\/watches\/(\d+)\/expenses$/,         watchIn],
  ['PUT',    /^\/expenses\/(\d+)\/boutique$/,        expIn],
  ['POST',   /^\/expenses\/(\d+)\/reverse$/,         expIn],
  ['POST',   /^\/profiles$/,                         () => true],   // a client for THIS shop (routes/profiles.js checks shop_id)
  ['GET',    /^\/profiles\/(\d+)$/,                  profIn],
  ['GET',    /^\/profiles\/(\d+)\/watches$/,          profIn],
  ['GET',    /^\/profiles\/(\d+)\/company-docs$/,     profIn],
  ['POST',   /^\/profiles\/(\d+)\/watches$/,          profIn],
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

  // Answered here: the shop itself as the only shop, its clients and its
  // managers — lists that have no shop_id filter elsewhere
  if (req.method === 'GET' && p === '/shops') {
    const shop = db.listShops(c.owner_id).find(x => x.id === shopId);
    return res.json(shop ? [shop] : []);
  }
  if (req.method === 'GET' && p === '/profiles') {
    const shop = db.getShop(shopId, c.owner_id);
    return res.json(shop ? db.listProfilesForShop(shopId, c.owner_id).map(x => ({ ...x, shop_name: shop.name })) : []);
  }
  if (req.method === 'GET' && p === '/boutique-managers') {
    return res.json(db.listBoutiqueManagers(c.owner_id).filter(m => m.shop_id === shopId));
  }
  // "Existing Client" inside the shared shop picks from the collaborator's OWN
  // client book (their registry, not the owner's); routes/profiles.js then
  // copies the chosen client into the owner's registry for the membership.
  if (req.method === 'GET' && p === '/clients') return res.json(db.listClients(u.id));
  if (req.method === 'GET' && p === '/clients/lookup') {
    const masterId = String(req.query.master_id || '').trim();
    if (!masterId) return res.status(400).json({ error: 'master_id query param required' });
    const own = db.getClientByMasterId(masterId, u.id);
    if (!own) return res.status(404).json({ error: 'No client of yours with that Master ID' });
    return res.json(db.getClientWithMemberships(own.id, u.id));
  }
  {
    const m = req.method === 'GET' && p.match(/^\/clients\/(\d+)$/);
    if (m) {
      const own = db.getClientWithMemberships(m[1], u.id);
      return own ? res.json(own) : res.status(404).json({ error: 'Not one of your clients' });
    }
  }

  for (const [method, re, check] of ALLOWED) {
    if (req.method !== method) continue;
    const m = p.match(re);
    if (!m) continue;
    const ok = check(m, req.collab);
    if (ok === null)  return res.status(404).json({ error: 'Not found in this shop' });
    if (ok === false) return res.status(403).json({ error: DENY_MSG });
    if (method === 'GET' && (p === '/watches' || p === '/portfolios')) req.query.shop_id = String(shopId);   // never the whole registry
    return next('router');
  }
  res.status(403).json({ error: DENY_MSG });
});

module.exports = router;
