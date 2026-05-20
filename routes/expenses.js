'use strict';

const express = require('express');
const db      = require('../db');
const audit   = require('../lib/audit');

const router = express.Router({ mergeParams: true });
const uid    = req => req.session.viewing_as || req.session.user.id;

// GET /api/watches/:watchId/expenses
router.get('/watches/:watchId/expenses', (req, res) => {
  const watch = db.getWatch(req.params.watchId, uid(req));
  if (!watch) return res.status(404).json({ error: 'Watch not found' });
  res.json(db.listExpenses(watch.id));
});

// POST /api/watches/:watchId/expenses
router.post('/watches/:watchId/expenses', (req, res) => {
  const watch = db.getWatch(req.params.watchId, uid(req));
  if (!watch) return res.status(404).json({ error: 'Watch not found' });
  if (watch.status === 'wishlist') return res.status(400).json({ error: 'Cannot add expenses to a wishlist watch' });

  const { category, date, amount, currency, description } = req.body;
  if (!date)   return res.status(400).json({ error: 'date is required' });
  if (!amount) return res.status(400).json({ error: 'amount is required' });

  const parsed = Number(amount);
  if (isNaN(parsed) || parsed <= 0) return res.status(400).json({ error: 'amount must be a positive number' });

  try {
    const id      = db.createExpense({ watch_id: watch.id, category, date, amount: parsed, currency, description });
    const expense = db.getExpense(id);
    const updated = db.getWatch(watch.id, uid(req));
    audit(req, { action: 'create', targetType: 'expense', targetId: id, details: { watch_id: watch.id, model: watch.model, amount: parsed, category, date } });
    res.status(201).json({ expense, watch: updated });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Database error' });
  }
});

// POST /api/expenses/:id/reverse
router.post('/expenses/:id/reverse', (req, res) => {
  const expense = db.getExpense(req.params.id);
  if (!expense) return res.status(404).json({ error: 'Expense not found' });
  // Ownership check: parent watch must belong to current user
  const owner = db.getOwnerIdForWatch(expense.watch_id);
  if (owner !== uid(req)) return res.status(404).json({ error: 'Expense not found' });
  if (expense.reversed) return res.status(409).json({ error: 'Expense already reversed' });

  db.reverseExpense(req.params.id);
  const updated = db.getWatch(expense.watch_id, uid(req));
  audit(req, { action: 'reverse', targetType: 'expense', targetId: Number(req.params.id), details: { watch_id: expense.watch_id, amount: expense.amount, category: expense.category } });
  res.json({ ok: true, watch: updated });
});

module.exports = router;
