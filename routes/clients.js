'use strict';

const express = require('express');
const path    = require('path');
const crypto  = require('crypto');
const multer  = require('multer');
const db      = require('../db');
const storage = require('../lib/storage');
const audit   = require('../lib/audit');

const router = express.Router();
const uid    = req => req.session.viewing_as || req.session.user.id;

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['.jpg','.jpeg','.png','.webp'].includes(path.extname(file.originalname).toLowerCase());
    cb(null, ok);
  },
});

// GET /api/clients
router.get('/', (req, res) => {
  res.json(db.listClients(uid(req)));
});

// POST /api/clients
router.post('/', (req, res) => {
  upload.single('photo')(req, res, async (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 10 MB)' : err.message || 'Upload error';
      return res.status(400).json({ error: msg });
    }
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    try {
      const photoUrl = req.file ? await storage.uploadFile(req.file, 'meridian/clients/photos') : null;
      const id = db.createClient({ name: name.trim(), photo_path: photoUrl, ownerId: uid(req) });
      audit(req, { action: 'create', targetType: 'client', targetId: id, details: { name: name.trim(), owner_id: uid(req) } });
      res.status(201).json(db.getClient(id, uid(req)));
    } catch (e) {
      res.status(500).json({ error: e.message || 'Database error' });
    }
  });
});

// GET /api/clients/lookup?master_id=001
router.get('/lookup', (req, res) => {
  const { master_id } = req.query;
  if (!master_id) return res.status(400).json({ error: 'master_id query param required' });
  const client = db.getClientByMasterId(master_id.trim(), uid(req));
  if (!client) return res.status(404).json({ error: 'No client found with that Master ID' });
  res.json(db.getClientWithMemberships(client.id, uid(req)));
});

// GET /api/clients/:id
router.get('/:id', (req, res) => {
  const client = db.getClientWithMemberships(req.params.id, uid(req));
  if (!client) return res.status(404).json({ error: 'Not found' });
  res.json(client);
});

// PUT /api/clients/:id
router.put('/:id', (req, res) => {
  upload.single('photo')(req, res, async (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 10 MB)' : err.message || 'Upload error';
      return res.status(400).json({ error: msg });
    }
    const client = db.getClient(req.params.id, uid(req));
    if (!client) return res.status(404).json({ error: 'Not found' });

    const updates = {};
    if (req.body.name)      updates.name      = req.body.name.trim();
    if (req.body.master_id !== undefined) updates.master_id = req.body.master_id ? req.body.master_id.trim() : null;
    try {
      if (req.file) {
        await storage.deleteFile(client.photo_path);
        updates.photo_path = await storage.uploadFile(req.file, 'meridian/clients/photos');
      }
      db.updateClient(req.params.id, updates, uid(req));
      audit(req, { action: 'update', targetType: 'client', targetId: Number(req.params.id), details: { fields: Object.keys(updates) } });
      res.json(db.getClient(req.params.id, uid(req)));
    } catch (e) {
      res.status(500).json({ error: e.message || 'Database error' });
    }
  });
});

// DELETE /api/clients/:id
router.delete('/:id', async (req, res) => {
  const client = db.getClientWithMemberships(req.params.id, uid(req));
  if (!client) return res.status(404).json({ error: 'Not found' });
  for (const m of client.memberships || []) {
    await storage.deleteFile(m.id_card_path);
    for (const w of m.watches || []) await storage.deleteFile(w.image_path);
  }
  await storage.deleteFile(client.photo_path);
  db.deleteClient(req.params.id, uid(req));
  audit(req, { action: 'delete', targetType: 'client', targetId: Number(req.params.id), details: { name: client.name } });
  res.json({ ok: true });
});

// POST /api/clients/:id/generate-link — rotate share token. Returns the public URL.
// Ownership is enforced via getClient; any pre-existing token is overwritten,
// so old links are invalidated atomically with the new one being issued.
router.post('/:id/generate-link', (req, res) => {
  const client = db.getClient(req.params.id, uid(req));
  if (!client) return res.status(404).json({ error: 'Not found' });
  const token = crypto.randomBytes(32).toString('hex');
  db.setClientToken(req.params.id, token, uid(req));
  audit(req, { action: 'rotate_share_token', targetType: 'client', targetId: Number(req.params.id), details: { name: client.name } });
  res.json({ token, url: `/c/${token}` });
});

module.exports = router;
