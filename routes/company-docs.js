'use strict';

const express = require('express');
const path    = require('path');
const fs      = require('fs');
const multer  = require('multer');
const db      = require('../db');
const { UPLOADS_DIR } = require('../config');

const router = express.Router({ mergeParams: true });

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `cdoc_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png', '.webp'];
    cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()));
  },
});

function unlinkOld(storedPath) {
  if (storedPath?.startsWith('/uploads/')) {
    fs.unlink(path.join(UPLOADS_DIR, path.basename(storedPath)), () => {});
  }
}

// GET /api/profiles/:id/company-docs
router.get('/', (req, res) => {
  if (!db.getProfile(req.params.id)) return res.status(404).json({ error: 'Profile not found' });
  res.json(db.listCompanyDocs(req.params.id));
});

// POST /api/profiles/:id/company-docs
router.post('/', (req, res) => {
  upload.single('document')(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 20 MB)' : err.message || 'Upload error';
      return res.status(400).json({ error: msg });
    }
    if (!db.getProfile(req.params.id)) return res.status(404).json({ error: 'Profile not found' });
    const { shop_name } = req.body;
    if (!shop_name?.trim()) return res.status(400).json({ error: 'shop_name is required' });
    if (!req.file) return res.status(400).json({ error: 'Document file is required' });

    const docId = db.createCompanyDoc(req.params.id, {
      shop_name: shop_name.trim(),
      doc_path:  `/uploads/${req.file.filename}`,
    });
    res.status(201).json(db.getCompanyDoc(docId));
  });
});

// DELETE /api/profiles/:id/company-docs/:docId
router.delete('/:docId', (req, res) => {
  const doc = db.getCompanyDoc(req.params.docId);
  if (!doc || String(doc.profile_id) !== String(req.params.id)) {
    return res.status(404).json({ error: 'Not found' });
  }
  unlinkOld(doc.doc_path);
  db.deleteCompanyDoc(req.params.docId);
  res.json({ ok: true });
});

module.exports = router;
