'use strict';

const express = require('express');
const db      = require('../db');
const audit   = require('../lib/audit');

const router = express.Router({ mergeParams: true });
const uid    = req => req.session.viewing_as || req.session.user.id;

// GET /api/watches/:watchId/loss-payments
router.get('/watches/:watchId/loss-payments', (req, res) => {
  const watch = db.getWatch(req.params.watchId, uid(req));
  if (!watch) return res.status(404).json({ error: 'Watch not found' });
  res.json(db.listLossPayments(watch.id));
});

// POST /api/watches/:watchId/loss-payments
router.post('/watches/:watchId/loss-payments', (req, res) => {
  const watch = db.getWatch(req.params.watchId, uid(req));
  if (!watch) return res.status(404).json({ error: 'Watch not found' });

  const { date, amount, method, notes } = req.body;
  if (!date)   return res.status(400).json({ error: 'date is required' });
  if (!amount) return res.status(400).json({ error: 'amount is required' });

  const parsed = Number(amount);
  if (isNaN(parsed) || parsed <= 0) return res.status(400).json({ error: 'amount must be a positive number' });

  try {
    const id      = db.createLossPayment({ watch_id: watch.id, date, amount: parsed, method, notes });
    const payment = db.getLossPayment(id);
    const updated = db.getWatch(watch.id, uid(req));
    audit(req, { action: 'create', targetType: 'loss_payment', targetId: id, details: { watch_id: watch.id, model: watch.model, amount: parsed, method, date } });
    res.status(201).json({ payment, watch: updated });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Database error' });
  }
});

// POST /api/loss-payments/:id/reverse
router.post('/loss-payments/:id/reverse', (req, res) => {
  const payment = db.getLossPayment(req.params.id);
  if (!payment) return res.status(404).json({ error: 'Payment not found' });
  // Ownership check: parent watch must belong to current user
  const owner = db.getOwnerIdForWatch(payment.watch_id);
  if (owner !== uid(req)) return res.status(404).json({ error: 'Payment not found' });
  if (payment.reversed) return res.status(409).json({ error: 'Payment already reversed' });

  db.reversePayment(req.params.id);
  const updated = db.getWatch(payment.watch_id, uid(req));
  audit(req, { action: 'reverse', targetType: 'loss_payment', targetId: Number(req.params.id), details: { watch_id: payment.watch_id, amount: payment.amount } });
  res.json({ ok: true, watch: updated });
});

module.exports = router;
