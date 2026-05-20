'use strict';

const express = require('express');
const db      = require('../db');
const audit   = require('../lib/audit');

const router = express.Router({ mergeParams: true });
const uid    = req => req.session.viewing_as || req.session.user.id;

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeListHandler(side) {
  const listFn = side === 'client' ? db.listClientPayouts : db.listMyPayouts;
  return (req, res) => {
    const watch = db.getWatch(req.params.watchId, uid(req));
    if (!watch) return res.status(404).json({ error: 'Watch not found' });
    res.json(listFn(watch.id));
  };
}

function makeCreateHandler(side) {
  const createFn = side === 'client' ? db.createClientPayout : db.createMyPayout;
  const getFn    = side === 'client' ? db.getClientPayout    : db.getMyPayout;
  const target   = side === 'client' ? 'client_payout'       : 'my_payout';
  return (req, res) => {
    const watch = db.getWatch(req.params.watchId, uid(req));
    if (!watch) return res.status(404).json({ error: 'Watch not found' });

    const { date, amount, currency, method, notes } = req.body;
    if (!date)   return res.status(400).json({ error: 'date is required' });
    if (!amount) return res.status(400).json({ error: 'amount is required' });
    const parsed = Number(amount);
    if (isNaN(parsed) || parsed <= 0) return res.status(400).json({ error: 'amount must be a positive number' });

    try {
      const id     = createFn({ watch_id: watch.id, date, amount: parsed, currency: currency || watch.currency || 'CHF', method, notes });
      const payout = getFn(id);
      const updated = db.getWatch(watch.id, uid(req));
      audit(req, { action: 'create', targetType: target, targetId: id, details: { watch_id: watch.id, model: watch.model, amount: parsed, method, date } });
      res.status(201).json({ payout, watch: updated });
    } catch (e) {
      res.status(500).json({ error: e.message || 'Database error' });
    }
  };
}

function makeReverseHandler(side) {
  const getFn     = side === 'client' ? db.getClientPayout     : db.getMyPayout;
  const reverseFn = side === 'client' ? db.reverseClientPayout : db.reverseMyPayout;
  const target    = side === 'client' ? 'client_payout'        : 'my_payout';
  return (req, res) => {
    const payout = getFn(req.params.id);
    if (!payout) return res.status(404).json({ error: 'Payout not found' });
    const owner = db.getOwnerIdForWatch(payout.watch_id);
    if (owner !== uid(req)) return res.status(404).json({ error: 'Payout not found' });
    if (payout.reversed) return res.status(409).json({ error: 'Payout already reversed' });

    reverseFn(req.params.id);
    const updated = db.getWatch(payout.watch_id, uid(req));
    audit(req, { action: 'reverse', targetType: target, targetId: Number(req.params.id), details: { watch_id: payout.watch_id, amount: payout.amount } });
    res.json({ ok: true, watch: updated });
  };
}

// ── Client payouts ────────────────────────────────────────────────────────────
router.get ('/watches/:watchId/client-payouts',  makeListHandler   ('client'));
router.post('/watches/:watchId/client-payouts',  makeCreateHandler ('client'));
router.post('/client-payouts/:id/reverse',       makeReverseHandler('client'));

// ── My payouts ────────────────────────────────────────────────────────────────
router.get ('/watches/:watchId/my-payouts',      makeListHandler   ('my'));
router.post('/watches/:watchId/my-payouts',      makeCreateHandler ('my'));
router.post('/my-payouts/:id/reverse',           makeReverseHandler('my'));

module.exports = router;
