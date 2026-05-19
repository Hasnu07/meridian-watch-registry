'use strict';

const express  = require('express');
const path     = require('path');
const multer   = require('multer');
const db       = require('../db');
const storage  = require('../lib/storage');
const notifier = require('../lib/event-notifier');
const audit    = require('../lib/audit');

const router = express.Router();
const uid    = req => req.session.viewing_as || req.session.user.id;

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
  res.json(db.listAllWatches({ q, source, profile_id, ownerId: uid(req) }));
});

// PUT /api/watches/:id
router.put('/:id', (req, res) => {
  upload.single('image')(req, res, async (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 10 MB)' : err.message || 'Upload error';
      return res.status(400).json({ error: msg });
    }
    const watch = db.getWatch(req.params.id, uid(req));
    if (!watch) return res.status(404).json({ error: 'Not found' });
    if (req.body.source && !['Company', 'Dealer'].includes(req.body.source)) {
      return res.status(400).json({ error: 'source must be Company or Dealer' });
    }

    const updates = { ...req.body };
    ['price','list_price','sale_price','my_cost','client_cost','my_received','client_received'].forEach(f => {
      if (updates[f] !== undefined) updates[f] = updates[f] !== '' ? Number(updates[f]) : null;
    });
    if (updates.status && !['wishlist','purchased','sold'].includes(updates.status)) delete updates.status;

    try {
      if (req.file) {
        await storage.deleteFile(watch.image_path);
        updates.image_path = await storage.uploadFile(req.file, 'meridian/watches');
      }

      const oldStatus = watch.status;
      const newStatus = updates.status || oldStatus;

      // Lock discount_rate_applied on first transition to 'sold' for discount profiles
      if (newStatus === 'sold' && oldStatus !== 'sold' && watch.discount_rate_applied == null) {
        const profile = db.getProfile(watch.profile_id, uid(req));
        if (profile?.trading_rule === 'discount') {
          updates.discount_rate_applied = profile.discount_split ?? 0.08;
        }
      }

      db.updateWatch(req.params.id, updates, uid(req));
      const updated = db.getWatch(req.params.id, uid(req));

      const auditDetails = { model: watch.model, fields: Object.keys(updates) };
      if (updates.status && updates.status !== oldStatus) {
        auditDetails.status_from = oldStatus;
        auditDetails.status_to   = newStatus;
        const profile = db.getProfile(watch.profile_id, uid(req));
        notifier.onWatchStatusChanged(watch, newStatus, updates, profile);
      }
      audit(req, { action: 'update', targetType: 'watch', targetId: Number(req.params.id), details: auditDetails });

      res.json(updated);
    } catch (e) {
      return res.status(500).json({ error: e.message || 'Database error' });
    }
  });
});

// DELETE /api/watches/:id
router.delete('/:id', async (req, res) => {
  const watch = db.getWatch(req.params.id, uid(req));
  if (!watch) return res.status(404).json({ error: 'Not found' });
  const profile = db.getProfile(watch.profile_id, uid(req));
  await storage.deleteFile(watch.image_path);
  db.deleteWatch(req.params.id, uid(req));
  audit(req, { action: 'delete', targetType: 'watch', targetId: Number(req.params.id), details: { model: watch.model, status: watch.status } });
  notifier.onWatchDeleted(watch, profile);
  res.json({ ok: true });
});

module.exports = router;
