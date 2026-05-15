'use strict';

const express = require('express');
const db      = require('../db');

const router = express.Router({ mergeParams: true });

// GET /api/watches/:watchId/loss-payments
router.get('/watches/:watchId/loss-payments', (req, res) => {
  const watch = db.getWatch(req.params.watchId);
  if (!watch) return res.status(404).json({ error: 'Watch not found' });
  res.json(db.listLossPayments(watch.id));
});

// POST /api/watches/:watchId/loss-payments
router.post('/watches/:watchId/loss-payments', (req, res) => {
  const watch = db.getWatch(req.params.watchId);
  if (!watch) return res.status(404).json({ error: 'Watch not found' });

  const { date, amount, method, notes } = req.body;
  if (!date)   return res.status(400).json({ error: 'date is required' });
  if (!amount) return res.status(400).json({ error: 'amount is required' });

  const parsed = Number(amount);
  if (isNaN(parsed) || parsed <= 0) return res.status(400).json({ error: 'amount must be a positive number' });

  try {
    const id      = db.createLossPayment({ watch_id: watch.id, date, amount: parsed, method, notes });
    const payment = db.getLossPayment(id);
    const updated = db.getWatch(watch.id);           // grab refreshed loss_status
    res.status(201).json({ payment, watch: updated });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Database error' });
  }
});

// POST /api/loss-payments/:id/reverse
router.post('/loss-payments/:id/reverse', (req, res) => {
  const payment = db.getLossPayment(req.params.id);
  if (!payment) return res.status(404).json({ error: 'Payment not found' });
  if (payment.reversed) return res.status(409).json({ error: 'Payment already reversed' });

  db.reversePayment(req.params.id);
  const updated = db.getWatch(payment.watch_id);
  res.json({ ok: true, watch: updated });
});

module.exports = router;
