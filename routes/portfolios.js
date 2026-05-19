'use strict';

const express = require('express');
const crypto  = require('crypto');
const db      = require('../db');
const audit   = require('../lib/audit');

const router = express.Router();
const uid    = req => req.session.viewing_as || req.session.user.id;

// GET /api/portfolios?shop_id=X
router.get('/', (req, res) => {
  if (!req.query.shop_id) return res.status(400).json({ error: 'shop_id required' });
  res.json(db.listPortfolios(Number(req.query.shop_id), uid(req)));
});

// POST /api/portfolios
router.post('/', (req, res) => {
  const { name, shop_id } = req.body;
  if (!name || !shop_id) return res.status(400).json({ error: 'name and shop_id required' });
  // Make sure the target shop belongs to this user
  if (!db.getShop(Number(shop_id), uid(req))) return res.status(404).json({ error: 'Shop not found' });
  const id = db.createPortfolio({ name: name.trim(), shop_id: Number(shop_id), ownerId: uid(req) });
  audit(req, { action: 'create', targetType: 'portfolio', targetId: id, details: { name: name.trim(), shop_id: Number(shop_id), owner_id: uid(req) } });
  res.status(201).json(db.getPortfolio(id, uid(req)));
});

// GET /api/portfolios/:id
router.get('/:id', (req, res) => {
  const portfolio = db.getPortfolio(req.params.id, uid(req));
  if (!portfolio) return res.status(404).json({ error: 'Not found' });
  res.json({ ...portfolio, clients: db.listProfilesForPortfolio(req.params.id) });
});

// PUT /api/portfolios/:id
router.put('/:id', (req, res) => {
  if (!db.getPortfolio(req.params.id, uid(req))) return res.status(404).json({ error: 'Not found' });
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  db.updatePortfolio(req.params.id, { name: name.trim() }, uid(req));
  audit(req, { action: 'update', targetType: 'portfolio', targetId: Number(req.params.id), details: { name: name.trim() } });
  res.json(db.getPortfolio(req.params.id, uid(req)));
});

// DELETE /api/portfolios/:id
router.delete('/:id', (req, res) => {
  const pf = db.getPortfolio(req.params.id, uid(req));
  if (!pf) return res.status(404).json({ error: 'Not found' });
  db.deletePortfolio(req.params.id, uid(req));
  audit(req, { action: 'delete', targetType: 'portfolio', targetId: Number(req.params.id), details: { name: pf.name } });
  res.json({ ok: true });
});

// POST /api/portfolios/:id/generate-link  — create/rotate share token
router.post('/:id/generate-link', (req, res) => {
  const portfolio = db.getPortfolio(req.params.id, uid(req));
  if (!portfolio) return res.status(404).json({ error: 'Not found' });
  const token = crypto.randomBytes(32).toString('hex');
  db.setPortfolioToken(req.params.id, token, uid(req));
  res.json({ token, url: `/p/${token}` });
});

module.exports = router;
