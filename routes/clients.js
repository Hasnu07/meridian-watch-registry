'use strict';

const express = require('express');
const path    = require('path');
const multer  = require('multer');
const db      = require('../db');
const storage = require('../lib/storage');

const router = express.Router();

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
  res.json(db.listClients());
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
      const id = db.createClient({ name: name.trim(), photo_path: photoUrl });
      res.status(201).json(db.getClient(id));
    } catch (e) {
      res.status(500).json({ error: e.message || 'Database error' });
    }
  });
});

// GET /api/clients/:id  — with all memberships + watches
router.get('/:id', (req, res) => {
  const client = db.getClientWithMemberships(req.params.id);
  if (!client) return res.status(404).json({ error: 'Not found' });
  res.json(client);
});

// PUT /api/clients/:id  — update name and/or photo (syncs to all linked profiles)
router.put('/:id', (req, res) => {
  upload.single('photo')(req, res, async (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 10 MB)' : err.message || 'Upload error';
      return res.status(400).json({ error: msg });
    }
    const client = db.getClient(req.params.id);
    if (!client) return res.status(404).json({ error: 'Not found' });

    const updates = {};
    if (req.body.name) updates.name = req.body.name.trim();
    try {
      if (req.file) {
        await storage.deleteFile(client.photo_path);
        updates.photo_path = await storage.uploadFile(req.file, 'meridian/clients/photos');
      }
      db.updateClient(req.params.id, updates);
      res.json(db.getClient(req.params.id));
    } catch (e) {
      res.status(500).json({ error: e.message || 'Database error' });
    }
  });
});

// DELETE /api/clients/:id
router.delete('/:id', async (req, res) => {
  const client = db.getClientWithMemberships(req.params.id);
  if (!client) return res.status(404).json({ error: 'Not found' });
  // Clean up all linked membership files (id_cards) and watch images
  for (const m of client.memberships || []) {
    await storage.deleteFile(m.id_card_path);
    for (const w of m.watches || []) await storage.deleteFile(w.image_path);
  }
  await storage.deleteFile(client.photo_path);
  db.deleteClient(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
