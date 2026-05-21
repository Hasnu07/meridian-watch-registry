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
  res.json(db.listAllWatches({ q, source, profile_id, ownerId: uid(req) }).map(w => ({
    ...w,
    expenses:       db.listExpenses(w.id),
    client_payouts: db.listClientPayouts(w.id),
    my_payouts:     db.listMyPayouts(w.id),
  })));
});

// GET /api/watches/:id  — full detail (watch + profile + ledgers)
router.get('/:id', (req, res) => {
  const watch = db.getWatch(req.params.id, uid(req));
  if (!watch) return res.status(404).json({ error: 'Not found' });
  const profile = db.getProfile(watch.profile_id, uid(req));
  const client  = profile?.client_id ? db.getClient(profile.client_id, uid(req)) : null;
  res.json({
    ...watch,
    expenses:       db.listExpenses(watch.id),
    loss_payments:  db.listLossPayments(watch.id),
    client_payouts: db.listClientPayouts(watch.id),
    my_payouts:     db.listMyPayouts(watch.id),
    profile:        profile || null,
    client:         client  || null,
  });
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

      // Auto-create initial payout ledger entries on Mark Sold transition.
      // Mirrors the legacy single-snapshot UX while populating the ledger so it
      // remains the authoritative source for "paid to date".
      const transitioningToSold   = updates.status === 'sold' && oldStatus !== 'sold';
      const transitioningFromSold = oldStatus === 'sold' && updates.status && updates.status !== 'sold';

      if (transitioningToSold) {
        // Sale date precedence: explicit sale_date > explicit purchase_date >
        // existing purchase_date > today. The Mark Sold modal sends sale_date.
        const saleDate = req.body.sale_date || updates.purchase_date || updated.purchase_date || new Date().toISOString().split('T')[0];
        const cur      = updated.currency || 'CHF';
        // Use the resulting watch values (not request body) so this fires for both
        // Mark Sold (snapshot fields just set) AND Edit Watch (values may have been
        // entered earlier or are still null). Null/0 → skip; user can record manually.
        const clientRecv = updated.client_received != null ? Number(updated.client_received) : null;
        const myRecv     = updated.my_received     != null ? Number(updated.my_received)     : null;
        if (clientRecv && clientRecv > 0 && db.listClientPayouts(updated.id).length === 0) {
          const pid = db.createClientPayout({ watch_id: updated.id, date: saleDate, amount: clientRecv, currency: cur, method: 'AUTO_ON_SALE', notes: 'Recorded at sale' });
          audit(req, { action: 'create', targetType: 'client_payout', targetId: pid, details: { watch_id: updated.id, amount: clientRecv, method: 'AUTO_ON_SALE', auto: true } });
        }
        if (myRecv && myRecv > 0 && db.listMyPayouts(updated.id).length === 0) {
          const pid = db.createMyPayout({ watch_id: updated.id, date: saleDate, amount: myRecv, currency: cur, method: 'AUTO_ON_SALE', notes: 'Recorded at sale' });
          audit(req, { action: 'create', targetType: 'my_payout', targetId: pid, details: { watch_id: updated.id, amount: myRecv, method: 'AUTO_ON_SALE', auto: true } });
        }
      } else if (transitioningFromSold) {
        // Reverting from sold (e.g. Edit Watch flipped back to purchased/wishlist):
        // reverse any AUTO_ON_SALE ledger entries so the ledger stays consistent
        // with the sale being undone. Manually-entered payouts are left untouched.
        for (const p of db.listClientPayouts(updated.id)) {
          if (!p.reversed && p.method === 'AUTO_ON_SALE') {
            db.reverseClientPayout(p.id);
            audit(req, { action: 'reverse', targetType: 'client_payout', targetId: p.id, details: { watch_id: updated.id, amount: p.amount, auto_revert: true } });
          }
        }
        for (const p of db.listMyPayouts(updated.id)) {
          if (!p.reversed && p.method === 'AUTO_ON_SALE') {
            db.reverseMyPayout(p.id);
            audit(req, { action: 'reverse', targetType: 'my_payout', targetId: p.id, details: { watch_id: updated.id, amount: p.amount, auto_revert: true } });
          }
        }
      }

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
