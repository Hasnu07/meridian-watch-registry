'use strict';

const express = require('express');
const db      = require('../db');

const router = express.Router();

// GET /api/shops
router.get('/', (req, res) => {
  res.json(db.listShops());
});

// POST /api/shops
router.post('/', (req, res) => {
  const { name, address } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });
  try {
    const id = db.createShop({ name: name.trim(), address: address || null });
    res.status(201).json(db.getShop(id));
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Database error' });
  }
});

// GET /api/shops/:id
router.get('/:id', (req, res) => {
  const shop = db.getShop(req.params.id);
  if (!shop) return res.status(404).json({ error: 'Not found' });
  res.json({ ...shop, profiles: db.listProfilesForShop(req.params.id) });
});

// PUT /api/shops/:id
router.put('/:id', (req, res) => {
  const shop = db.getShop(req.params.id);
  if (!shop) return res.status(404).json({ error: 'Not found' });
  const { name, address } = req.body;
  try {
    db.updateShop(req.params.id, {
      name:    name    !== undefined ? (name.trim() || null)    : undefined,
      address: address !== undefined ? (address.trim() || null) : undefined,
    });
    res.json(db.getShop(req.params.id));
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Database error' });
  }
});

// DELETE /api/shops/:id
router.delete('/:id', (req, res) => {
  if (!db.getShop(req.params.id)) return res.status(404).json({ error: 'Not found' });
  db.deleteShop(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
