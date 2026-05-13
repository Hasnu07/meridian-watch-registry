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
    const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
    cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()));
  },
});

// GET /api/watches
router.get('/', (req, res) => {
  const { q, source, profile_id } = req.query;
  res.json(db.listAllWatches({ q, source, profile_id }));
});

// PUT /api/watches/:id
router.put('/:id', (req, res) => {
  upload.single('image')(req, res, async (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 10 MB)' : err.message || 'Upload error';
      return res.status(400).json({ error: msg });
    }
    const watch = db.getWatch(req.params.id);
    if (!watch) return res.status(404).json({ error: 'Not found' });
    if (req.body.source && !['Company', 'Dealer'].includes(req.body.source)) {
      return res.status(400).json({ error: 'source must be Company or Dealer' });
    }

    const updates = { ...req.body };
    if (updates.price !== undefined) updates.price = updates.price !== '' ? Number(updates.price) : null;

    try {
      if (req.file) {
        await storage.deleteFile(watch.image_path);
        updates.image_path = await storage.uploadFile(req.file, 'meridian/watches');
      }

      db.updateWatch(req.params.id, updates);
      res.json(db.getWatch(req.params.id));
    } catch (e) {
      return res.status(500).json({ error: e.message || 'Database error' });
    }
  });
});

// DELETE /api/watches/:id
router.delete('/:id', async (req, res) => {
  const watch = db.getWatch(req.params.id);
  if (!watch) return res.status(404).json({ error: 'Not found' });
  await storage.deleteFile(watch.image_path);
  db.deleteWatch(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
