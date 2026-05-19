'use strict';

const express = require('express');
const path    = require('path');
const multer  = require('multer');
const db      = require('../db');
const storage = require('../lib/storage');
const audit   = require('../lib/audit');

const router = express.Router({ mergeParams: true });
const uid    = req => req.session.viewing_as || req.session.user.id;

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png', '.webp'];
    cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()));
  },
});

// GET /api/profiles/:id/company-docs
router.get('/', (req, res) => {
  if (!db.getProfile(req.params.id, uid(req))) return res.status(404).json({ error: 'Profile not found' });
  res.json(db.listCompanyDocs(req.params.id, uid(req)));
});

// POST /api/profiles/:id/company-docs
router.post('/', (req, res) => {
  upload.single('document')(req, res, async (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 20 MB)' : err.message || 'Upload error';
      return res.status(400).json({ error: msg });
    }
    if (!db.getProfile(req.params.id, uid(req))) return res.status(404).json({ error: 'Profile not found' });
    const { shop_name } = req.body;
    if (!shop_name?.trim()) return res.status(400).json({ error: 'shop_name is required' });
    if (!req.file) return res.status(400).json({ error: 'Document file is required' });

    try {
      const docUrl = await storage.uploadFile(req.file, 'meridian/company-docs');
      const docId = db.createCompanyDoc(req.params.id, {
        shop_name: shop_name.trim(),
        doc_path:  docUrl,
      });
      audit(req, { action: 'create', targetType: 'company_doc', targetId: docId, details: { profile_id: req.params.id, shop_name: shop_name.trim() } });
      res.status(201).json(db.getCompanyDoc(docId, uid(req)));
    } catch (e) {
      return res.status(500).json({ error: e.message || 'Upload failed' });
    }
  });
});

// DELETE /api/profiles/:id/company-docs/:docId
router.delete('/:docId', async (req, res) => {
  const doc = db.getCompanyDoc(req.params.docId, uid(req));
  if (!doc || String(doc.profile_id) !== String(req.params.id)) {
    return res.status(404).json({ error: 'Not found' });
  }
  await storage.deleteFile(doc.doc_path);
  db.deleteCompanyDoc(req.params.docId, uid(req));
  audit(req, { action: 'delete', targetType: 'company_doc', targetId: Number(req.params.docId), details: { profile_id: req.params.id, shop_name: doc.shop_name } });
  res.json({ ok: true });
});

module.exports = router;
