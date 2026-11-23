'use strict';

/**
 * Boutique salaries — a fixed monthly amount the owner pays the shop's
 * boutique manager, besides the commissions. Owned by the registry (uid), so
 * a master viewing as the owner and a collaborator of the shop (routes/collab.js
 * lets these through for the shared shop) manage it too; the manager reads it
 * through routes/boutique.js.
 */

const express = require('express');
const db      = require('../db');
const audit   = require('../lib/audit');
const uid     = require('../lib/uid');

const router = express.Router();
const CURRENCIES = ['EUR', 'CHF', 'USD', 'GBP'];

function ownSalary(req, res) {
  const salary = db.getSalary(req.params.id);
  if (!salary || salary.owner_id !== uid(req)) { res.status(404).json({ error: 'Salary not found' }); return null; }
  return salary;
}

// GET /api/shops/:id/salaries
router.get('/shops/:id/salaries', (req, res) => {
  const shop = db.getShop(req.params.id, uid(req));
  if (!shop) return res.status(404).json({ error: 'Not found' });
  res.json(db.listSalaries(shop.id, uid(req)));
});

// POST /api/shops/:id/salaries { amount, currency, start_month, end_month?, description? }
router.post('/shops/:id/salaries', (req, res) => {
  const shop = db.getShop(req.params.id, uid(req));
  if (!shop) return res.status(404).json({ error: 'Not found' });
  const { amount, currency, start_month, end_month, description } = req.body || {};
  const parsed = Number(amount);
  if (!(parsed > 0)) return res.status(400).json({ error: 'amount must be a positive number' });
  if (!db.isMonth(start_month)) return res.status(400).json({ error: 'start_month must be a month (YYYY-MM)' });
  if (end_month && (!db.isMonth(end_month) || end_month < start_month)) return res.status(400).json({ error: 'end_month must be a month on or after the start month' });
  const cur = CURRENCIES.includes(currency) ? currency : 'EUR';
  const id = db.createSalary({ shopId: shop.id, ownerId: uid(req), amount: parsed, currency: cur, start_month, end_month: end_month || null, description, createdBy: req.session.user.id });
  audit(req, { action: 'create', targetType: 'salary', targetId: id, details: { shop: shop.name, amount: parsed, currency: cur, start_month, end_month: end_month || null } });
  res.status(201).json(db.listSalaries(shop.id, uid(req)));
});

// PUT /api/salaries/:id { amount?, currency?, start_month?, end_month?, description? }
router.put('/salaries/:id', (req, res) => {
  const salary = ownSalary(req, res); if (!salary) return;
  const { amount, currency, start_month, end_month, description } = req.body || {};
  if (amount !== undefined && !(Number(amount) > 0)) return res.status(400).json({ error: 'amount must be a positive number' });
  if (currency !== undefined && !CURRENCIES.includes(currency)) return res.status(400).json({ error: 'unknown currency' });
  if (start_month !== undefined && !db.isMonth(start_month)) return res.status(400).json({ error: 'start_month must be a month (YYYY-MM)' });
  const start = start_month !== undefined ? start_month : salary.start_month;
  if (end_month !== undefined && end_month !== null && end_month !== '' && (!db.isMonth(end_month) || end_month < start)) return res.status(400).json({ error: 'end_month must be a month on or after the start month' });
  db.updateSalary(salary.id, { amount, currency, start_month, end_month, description });
  audit(req, { action: 'update', targetType: 'salary', targetId: salary.id, details: { from: { amount: salary.amount, currency: salary.currency, start_month: salary.start_month, end_month: salary.end_month }, to: { amount, currency, start_month, end_month } } });
  res.json(db.listSalaries(salary.shop_id, uid(req)));
});

// DELETE /api/salaries/:id
router.delete('/salaries/:id', (req, res) => {
  const salary = ownSalary(req, res); if (!salary) return;
  db.deleteSalary(salary.id);
  audit(req, { action: 'delete', targetType: 'salary', targetId: salary.id, details: { shop_id: salary.shop_id, amount: salary.amount, currency: salary.currency, start_month: salary.start_month } });
  res.json(db.listSalaries(salary.shop_id, uid(req)));
});

// PUT /api/salaries/:id/months/:month/paid { paid: true|false }
router.put('/salaries/:id/months/:month/paid', (req, res) => {
  const salary = ownSalary(req, res); if (!salary) return;
  const month = req.params.month;
  if (!salary.months.some(m => m.month === month)) return res.status(400).json({ error: 'That month is not part of this salary' });
  const paid = !!req.body?.paid;
  db.setSalaryMonthPaid(salary.id, month, paid);
  audit(req, { action: 'update', targetType: 'salary', targetId: salary.id, details: { month, paid, amount: salary.amount, currency: salary.currency } });
  res.json(db.listSalaries(salary.shop_id, uid(req)));
});

module.exports = router;
