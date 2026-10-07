'use strict';

const express = require('express');
const db      = require('../db');
const audit   = require('../lib/audit');

const router = express.Router();
const uid    = req => req.session.viewing_as || req.session.user.id;

// GET /api/shops
router.get('/', (req, res) => {
  res.json(db.listShops(uid(req)));
});

// POST /api/shops
router.post('/', (req, res) => {
  const { name, address } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });
  try {
    const id = db.createShop({ name: name.trim(), address: address || null, ownerId: uid(req) });
    audit(req, { action: 'create', targetType: 'shop', targetId: id, details: { name: name.trim(), owner_id: uid(req) } });
    res.status(201).json(db.getShop(id, uid(req)));
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Database error' });
  }
});

// GET /api/shops/:id
router.get('/:id', (req, res) => {
  const shop = db.getShop(req.params.id, uid(req));
  if (!shop) return res.status(404).json({ error: 'Not found' });
  res.json({ ...shop, profiles: db.listProfilesForShop(req.params.id, uid(req)) });
});

// GET /api/shops/:id/report — everything the shop PDF report needs in one go:
// portfolios plus every client in the shop with full watch ledgers.
router.get('/:id/report', (req, res) => {
  const shop = db.getShop(req.params.id, uid(req));
  if (!shop) return res.status(404).json({ error: 'Not found' });
  const profiles = db.listProfilesForShop(req.params.id, uid(req)).map(p => {
    const master = p.client_id ? db.getClient(p.client_id, uid(req)) : null;
    return {
      ...p,
      client_master_id: master?.master_id || null,
      watches: db.listWatchesForProfile(p.id, uid(req)).map(w => ({
        ...w,
        loss_payments:  db.listLossPayments(w.id),
        expenses:       db.listExpenses(w.id),
        client_payouts: db.listClientPayouts(w.id),
        my_payouts:     db.listMyPayouts(w.id),
      })),
    };
  });
  res.json({ shop, portfolios: db.listPortfolios(req.params.id, uid(req)), profiles });
});

// GET /api/shops/:id/individual-clients
router.get('/:id/individual-clients', (req, res) => {
  const shop = db.getShop(req.params.id, uid(req));
  if (!shop) return res.status(404).json({ error: 'Not found' });
  res.json(db.listIndividualProfilesForShop(req.params.id, uid(req)));
});

// PUT /api/shops/:id
router.put('/:id', (req, res) => {
  const shop = db.getShop(req.params.id, uid(req));
  if (!shop) return res.status(404).json({ error: 'Not found' });
  const { name, address } = req.body;
  try {
    db.updateShop(req.params.id, {
      name:    name    !== undefined ? (name.trim() || null)    : undefined,
      address: address !== undefined ? (address.trim() || null) : undefined,
    }, uid(req));
    audit(req, { action: 'update', targetType: 'shop', targetId: Number(req.params.id), details: { name, address } });
    res.json(db.getShop(req.params.id, uid(req)));
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Database error' });
  }
});

// DELETE /api/shops/:id
router.delete('/:id', (req, res) => {
  const shop = db.getShop(req.params.id, uid(req));
  if (!shop) return res.status(404).json({ error: 'Not found' });
  db.deleteShop(req.params.id, uid(req));
  audit(req, { action: 'delete', targetType: 'shop', targetId: Number(req.params.id), details: { name: shop.name } });
  res.json({ ok: true });
});

module.exports = router;
