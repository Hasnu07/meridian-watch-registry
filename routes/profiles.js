'use strict';

const express = require('express');
const path    = require('path');
const fs      = require('fs');
const multer  = require('multer');
const db      = require('../db');
const { UPLOADS_DIR } = require('../config');

const router = express.Router();

const ALLOWED = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const name = `${file.fieldname}_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, ALLOWED.includes(path.extname(file.originalname).toLowerCase())),
});

// handles photo + id_card for profiles, and image for watches under profiles
const profileUpload = upload.fields([
  { name: 'photo',   maxCount: 1 },
  { name: 'id_card', maxCount: 1 },
]);

const watchUpload = upload.single('image');

function filePath(file) {
  return file ? `/uploads/${file.filename}` : undefined;
}

function unlinkOld(storedPath) {
  if (storedPath?.startsWith('/uploads/')) {
    fs.unlink(path.join(UPLOADS_DIR, path.basename(storedPath)), () => {});
  }
}

// GET /api/profiles
router.get('/', (req, res) => {
  res.json(db.listProfiles());
});

// POST /api/profiles
router.post('/', (req, res) => {
  profileUpload(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 10 MB)' : err.message || 'Upload error';
      return res.status(400).json({ error: msg });
    }
    const { name, email, address, subscriber_id, pp_urn,
            title, first_name, last_name, gender, dob, postal_code, city, country, shop_id } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'name and email required' });

    try {
      const id = db.createProfile({
        name, email, address,
        subscriber_id: subscriber_id || null,
        pp_urn:        pp_urn        || null,
        photo_path:    filePath(req.files?.photo?.[0]),
        id_card_path:  filePath(req.files?.id_card?.[0]),
        title:         title        || null,
        first_name:    first_name   || null,
        last_name:     last_name    || null,
        gender:        gender       || null,
        dob:           dob          || null,
        postal_code:   postal_code  || null,
        city:          city         || null,
        country:       country      || null,
        shop_id:       shop_id      ? Number(shop_id) : null,
      });
      res.status(201).json(db.getProfile(id));
    } catch (e) {
      if (e.message?.includes('UNIQUE')) return res.status(409).json({ error: 'Email already exists' });
      return res.status(500).json({ error: e.message || 'Database error' });
    }
  });
});

// GET /api/profiles/:id
router.get('/:id', (req, res) => {
  const profile = db.getProfile(req.params.id);
  if (!profile) return res.status(404).json({ error: 'Not found' });
  res.json({ ...profile, watches: db.listWatchesForProfile(req.params.id) });
});

// PUT /api/profiles/:id
router.put('/:id', (req, res, next) => {
  profileUpload(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 10 MB)' : err.message || 'Upload error';
      return res.status(400).json({ error: msg });
    }

    const profile = db.getProfile(req.params.id);
    if (!profile) return res.status(404).json({ error: 'Not found' });

    const updates = {};
    const TEXT_FIELDS = ['name','email','address','subscriber_id','pp_urn',
                         'title','first_name','last_name','gender','dob',
                         'postal_code','city','country'];
    TEXT_FIELDS.forEach(f => {
      if (req.body[f] !== undefined) updates[f] = req.body[f] || null;
    });
    if (req.body.shop_id !== undefined) {
      updates.shop_id = req.body.shop_id ? Number(req.body.shop_id) : null;
    }

    if (req.files?.photo?.[0]) {
      unlinkOld(profile.photo_path);
      updates.photo_path = filePath(req.files.photo[0]);
    }
    if (req.files?.id_card?.[0]) {
      unlinkOld(profile.id_card_path);
      updates.id_card_path = filePath(req.files.id_card[0]);
    }

    try {
      db.updateProfile(req.params.id, updates);
      res.json(db.getProfile(req.params.id));
    } catch (e) {
      if (e.message?.includes('UNIQUE')) return res.status(409).json({ error: 'Email already exists' });
      return res.status(500).json({ error: e.message || 'Database error' });
    }
  });
});

// DELETE /api/profiles/:id
router.delete('/:id', (req, res) => {
  const profile = db.getProfile(req.params.id);
  if (!profile) return res.status(404).json({ error: 'Not found' });
  unlinkOld(profile.photo_path);
  unlinkOld(profile.id_card_path);
  db.deleteProfile(req.params.id);
  res.json({ ok: true });
});

// GET /api/profiles/:id/watches
router.get('/:id/watches', (req, res) => {
  if (!db.getProfile(req.params.id)) return res.status(404).json({ error: 'Not found' });
  res.json(db.listWatchesForProfile(req.params.id));
});

// POST /api/profiles/:id/watches  (multipart — supports watch image)
router.post('/:id/watches', (req, res) => {
  watchUpload(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 10 MB)' : err.message || 'Upload error';
      return res.status(400).json({ error: msg });
    }
    if (!db.getProfile(req.params.id)) return res.status(404).json({ error: 'Profile not found' });
    const { model, source } = req.body;
    if (!model || !source) return res.status(400).json({ error: 'model and source required' });
    if (!['Company', 'Dealer'].includes(source)) return res.status(400).json({ error: 'source must be Company or Dealer' });

    const id = db.createWatch(req.params.id, {
      ...req.body,
      price:      req.body.price != null && req.body.price !== '' ? Number(req.body.price) : null,
      image_path: filePath(req.file),
    });
    res.status(201).json(db.getWatch(id));
  });
});

module.exports = router;
