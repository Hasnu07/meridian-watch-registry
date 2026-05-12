'use strict';

const express = require('express');
const path    = require('path');
const fs      = require('fs');
const multer  = require('multer');
const db      = require('../db');
const { UPLOADS_DIR } = require('../config');

const router = express.Router();

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    cb(null, `watch_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
    cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()));
  },
});

function unlinkOld(storedPath) {
  if (storedPath?.startsWith('/uploads/')) {
    fs.unlink(path.join(UPLOADS_DIR, path.basename(storedPath)), () => {});
  }
}

// GET /api/watches
router.get('/', (req, res) => {
  const { q, source, profile_id } = req.query;
  res.json(db.listAllWatches({ q, source, profile_id }));
});

// PUT /api/watches/:id  (multipart — supports image replacement)
router.put('/:id', (req, res) => {
  upload.single('image')(req, res, (err) => {
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

    if (req.file) {
      unlinkOld(watch.image_path);
      updates.image_path = `/uploads/${req.file.filename}`;
    }

    try {
      db.updateWatch(req.params.id, updates);
      res.json(db.getWatch(req.params.id));
    } catch (e) {
      return res.status(500).json({ error: e.message || 'Database error' });
    }
  });
});

// DELETE /api/watches/:id
router.delete('/:id', (req, res) => {
  const watch = db.getWatch(req.params.id);
  if (!watch) return res.status(404).json({ error: 'Not found' });
  unlinkOld(watch.image_path);
  db.deleteWatch(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
