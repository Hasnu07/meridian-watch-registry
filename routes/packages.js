'use strict';

// Packages: the watches closed together at a shop, with the report the
// business reads off them. Mounted under /api; the maths of the report is the
// front end's (27-close-deals.js), the server only keeps the grouping.

const express = require('express');
const db      = require('../db');
const uid     = require('../lib/uid');

const router = express.Router();

const audit = (req, fields) => db.logAudit({
  actorId: req.session.user.id, actorUsername: req.session.user.username,
  viewingAs: req.session.viewing_as || null, ...fields,
});

// GET /api/profiles/:id/packages
router.get('/profiles/:id/packages', (req, res) => {
  const profile = db.getProfile(req.params.id, uid(req));
  if (!profile) return res.status(404).json({ error: 'Not found' });
  res.json(db.listPackages(profile.id));
});

// POST /api/profiles/:id/packages { watch_ids: [..], name?, note? }
// Closes the watches together as one package.
router.post('/profiles/:id/packages', (req, res) => {
  const profile = db.getProfile(req.params.id, uid(req));
  if (!profile) return res.status(404).json({ error: 'Not found' });
  const ids = Array.isArray(req.body?.watch_ids) ? req.body.watch_ids : [];
  if (!ids.length) return res.status(400).json({ error: 'Pick at least one watch' });
  const name = String(req.body?.name || '').trim().slice(0, 120) || null;
  const note = String(req.body?.note || '').trim().slice(0, 2000) || null;
  const pkg = db.createPackage({ profileId: profile.id, name, note, by: req.session.user.username, watchIds: ids });
  if (!pkg) return res.status(400).json({ error: 'Only sold, open watches of this client can be closed together' });
  audit(req, { action: 'create', targetType: 'package', targetId: pkg.id, details: { profile_id: profile.id, name, watch_ids: pkg.watches.map(w => w.id) } });
  res.status(201).json(pkg);
});

// GET /api/packages/:id
router.get('/packages/:id', (req, res) => {
  const pkg = db.getPackage(req.params.id, uid(req));
  if (!pkg) return res.status(404).json({ error: 'Not found' });
  res.json(pkg);
});

// PUT /api/packages/:id { name?, note? }
router.put('/packages/:id', (req, res) => {
  const pkg = db.getPackage(req.params.id, uid(req));
  if (!pkg) return res.status(404).json({ error: 'Not found' });
  const name = req.body?.name !== undefined ? String(req.body.name).trim().slice(0, 120) : undefined;
  const note = req.body?.note !== undefined ? String(req.body.note).trim().slice(0, 2000) : undefined;
  let lossHeldByMe;
  if (req.body?.loss_held_by_me !== undefined) {
    lossHeldByMe = Number(req.body.loss_held_by_me);
    if (!Number.isFinite(lossHeldByMe) || lossHeldByMe < 0) return res.status(400).json({ error: 'Loss held by my side must be a number, 0 or more' });
  }
  db.updatePackage(pkg.id, { name, note, lossHeldByMe });
  audit(req, { action: 'update', targetType: 'package', targetId: pkg.id, details: { name, note, loss_held_by_me: lossHeldByMe } });
  res.json(db.getPackage(pkg.id, uid(req)));
});

// DELETE /api/packages/:id — reopen the package: its watches are open again
router.delete('/packages/:id', (req, res) => {
  const pkg = db.getPackage(req.params.id, uid(req));
  if (!pkg) return res.status(404).json({ error: 'Not found' });
  db.deletePackage(pkg.id);
  audit(req, { action: 'delete', targetType: 'package', targetId: pkg.id, details: { name: pkg.name, watch_ids: pkg.watches.map(w => w.id) } });
  res.json({ ok: true });
});

module.exports = router;
