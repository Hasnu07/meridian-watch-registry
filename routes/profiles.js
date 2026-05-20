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

const ALLOWED = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, ALLOWED.includes(path.extname(file.originalname).toLowerCase())),
});

const profileUpload = upload.fields([
  { name: 'photo',   maxCount: 1 },
  { name: 'id_card', maxCount: 1 },
]);

const watchUpload = upload.single('image');

// GET /api/profiles
router.get('/', (req, res) => {
  res.json(db.listProfiles(uid(req)));
});

// POST /api/profiles
router.post('/', (req, res) => {
  profileUpload(req, res, async (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 10 MB)' : err.message || 'Upload error';
      return res.status(400).json({ error: msg });
    }
    const { name, email, address, pp_urn,
            title, first_name, last_name, gender, dob, postal_code, city, country,
            shop_id, portfolio_id, client_id,
            profit_split_me, loss_split_me,
            my_capital, my_remaining, client_capital, client_remaining,
            trading_rule, discount_split } = req.body;

    let resolvedName      = name;
    let resolvedPhotoPath = null;
    if (client_id) {
      const master = db.getClient(Number(client_id), uid(req));
      if (!master) return res.status(400).json({ error: 'Master client not found' });
      resolvedName      = master.name;
      resolvedPhotoPath = master.photo_path;
    }
    if (!resolvedName) return res.status(400).json({ error: 'name required' });

    // Verify shop / portfolio belong to this user when provided
    if (shop_id && !db.getShop(Number(shop_id), uid(req))) {
      return res.status(400).json({ error: 'Shop not found' });
    }
    if (portfolio_id && !db.getPortfolio(Number(portfolio_id), uid(req))) {
      return res.status(400).json({ error: 'Portfolio not found' });
    }

    try {
      const photoUrl   = !client_id && req.files?.photo?.[0]
        ? await storage.uploadFile(req.files.photo[0], 'meridian/profiles/photos')
        : resolvedPhotoPath;
      const idCardUrl  = req.files?.id_card?.[0] ? await storage.uploadFile(req.files.id_card[0], 'meridian/profiles/id-cards') : null;

      let resolvedClientId = client_id ? Number(client_id) : null;
      if (!resolvedClientId) {
        resolvedClientId = db.createClient({ name: resolvedName, photo_path: photoUrl, ownerId: uid(req) });
      }

      const id = db.createProfile({
        name:          resolvedName,
        email:         email || null,
        address,
        subscriber_id: null,
        pp_urn:        pp_urn || null,
        photo_path:    photoUrl,
        id_card_path:  idCardUrl,
        title:         title        || null,
        first_name:    first_name   || null,
        last_name:     last_name    || null,
        gender:        gender       || null,
        dob:           dob          || null,
        postal_code:   postal_code  || null,
        city:          city         || null,
        country:       country      || null,
        shop_id:          shop_id      ? Number(shop_id)      : null,
        portfolio_id:     portfolio_id ? Number(portfolio_id) : null,
        client_id:        resolvedClientId,
        profit_split_me:  profit_split_me  != null ? Number(profit_split_me)  : 100,
        loss_split_me:    loss_split_me    != null ? Number(loss_split_me)    : 100,
        my_capital:       my_capital       != null ? Number(my_capital)       : 0,
        my_remaining:     my_remaining     != null ? Number(my_remaining)     : 0,
        client_capital:   client_capital   != null ? Number(client_capital)   : 0,
        client_remaining: client_remaining != null ? Number(client_remaining) : 0,
        trading_rule:     trading_rule     || 'split',
        discount_split:   discount_split   != null ? Number(discount_split)   : 0.08,
        ownerId:          uid(req),
      });
      const created = db.getProfile(id, uid(req));
      audit(req, { action: 'create', targetType: 'profile', targetId: id, details: { name: created.name, shop_id: created.shop_id, owner_id: uid(req) } });
      notifier.onProfileCreated(created);
      res.status(201).json(created);
    } catch (e) {
      if (e.message?.includes('UNIQUE')) return res.status(409).json({ error: 'Email already exists' });
      return res.status(500).json({ error: e.message || 'Database error' });
    }
  });
});

// GET /api/profiles/:id
router.get('/:id', (req, res) => {
  const profile = db.getProfile(req.params.id, uid(req));
  if (!profile) return res.status(404).json({ error: 'Not found' });
  const watches = db.listWatchesForProfile(req.params.id, uid(req)).map(w => ({
    ...w,
    loss_payments: db.listLossPayments(w.id),
    expenses:      db.listExpenses(w.id),
  }));
  res.json({ ...profile, watches });
});

// PUT /api/profiles/:id
router.put('/:id', (req, res) => {
  profileUpload(req, res, async (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 10 MB)' : err.message || 'Upload error';
      return res.status(400).json({ error: msg });
    }

    const profile = db.getProfile(req.params.id, uid(req));
    if (!profile) return res.status(404).json({ error: 'Not found' });

    const updates = {};
    const isLinked = !!profile.client_id;
    const TEXT_FIELDS = isLinked
      ? ['email','address','pp_urn','title','first_name','last_name','gender','dob','postal_code','city','country','trading_rule']
      : ['name','email','address','pp_urn','title','first_name','last_name','gender','dob','postal_code','city','country','trading_rule'];
    const NUM_FIELDS = ['profit_split_me','loss_split_me','my_capital','my_remaining','client_capital','client_remaining','discount_split'];
    NUM_FIELDS.forEach(f => {
      if (req.body[f] !== undefined) updates[f] = req.body[f] !== '' ? Number(req.body[f]) : null;
    });
    TEXT_FIELDS.forEach(f => {
      if (req.body[f] !== undefined) updates[f] = req.body[f] || null;
    });
    if (req.body.shop_id !== undefined) {
      updates.shop_id = req.body.shop_id ? Number(req.body.shop_id) : null;
    }
    if (req.body.portfolio_id !== undefined) {
      updates.portfolio_id = req.body.portfolio_id ? Number(req.body.portfolio_id) : null;
    }

    try {
      if (!isLinked && req.files?.photo?.[0]) {
        await storage.deleteFile(profile.photo_path);
        updates.photo_path = await storage.uploadFile(req.files.photo[0], 'meridian/profiles/photos');
      }
      if (req.files?.id_card?.[0]) {
        await storage.deleteFile(profile.id_card_path);
        updates.id_card_path = await storage.uploadFile(req.files.id_card[0], 'meridian/profiles/id-cards');
      }

      db.updateProfile(req.params.id, updates, uid(req));
      audit(req, { action: 'update', targetType: 'profile', targetId: Number(req.params.id), details: { fields: Object.keys(updates) } });
      res.json(db.getProfile(req.params.id, uid(req)));
    } catch (e) {
      if (e.message?.includes('UNIQUE')) return res.status(409).json({ error: 'Email already exists' });
      return res.status(500).json({ error: e.message || 'Database error' });
    }
  });
});

// DELETE /api/profiles/:id
router.delete('/:id', async (req, res) => {
  const profile = db.getProfile(req.params.id, uid(req));
  if (!profile) return res.status(404).json({ error: 'Not found' });
  await storage.deleteFile(profile.photo_path);
  await storage.deleteFile(profile.id_card_path);
  db.deleteProfile(req.params.id, uid(req));
  audit(req, { action: 'delete', targetType: 'profile', targetId: Number(req.params.id), details: { name: profile.name } });
  notifier.onProfileDeleted(profile);
  res.json({ ok: true });
});

// DELETE /api/profiles/:id/id-card
router.delete('/:id/id-card', async (req, res) => {
  const profile = db.getProfile(req.params.id, uid(req));
  if (!profile) return res.status(404).json({ error: 'Not found' });
  if (profile.id_card_path) {
    await storage.deleteFile(profile.id_card_path);
    db.updateProfile(req.params.id, { id_card_path: null }, uid(req));
  }
  res.json({ ok: true });
});

// GET /api/profiles/:id/watches
router.get('/:id/watches', (req, res) => {
  if (!db.getProfile(req.params.id, uid(req))) return res.status(404).json({ error: 'Not found' });
  res.json(db.listWatchesForProfile(req.params.id, uid(req)));
});

// POST /api/profiles/:id/watches
router.post('/:id/watches', (req, res) => {
  watchUpload(req, res, async (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 10 MB)' : err.message || 'Upload error';
      return res.status(400).json({ error: msg });
    }
    const profile = db.getProfile(req.params.id, uid(req));
    if (!profile) return res.status(404).json({ error: 'Profile not found' });
    const { model, source } = req.body;
    if (!model || !source) return res.status(400).json({ error: 'model and source required' });
    if (!['Company', 'Dealer'].includes(source)) return res.status(400).json({ error: 'source must be Company or Dealer' });

    try {
      const imageUrl = req.file ? await storage.uploadFile(req.file, 'meridian/watches') : null;
      const num = v => v != null && v !== '' ? Number(v) : null;
      const id = db.createWatch(req.params.id, {
        ...req.body,
        price:           num(req.body.price),
        list_price:      num(req.body.list_price),
        sale_price:      num(req.body.sale_price),
        my_cost:         num(req.body.my_cost),
        client_cost:     num(req.body.client_cost),
        my_received:     num(req.body.my_received),
        client_received: num(req.body.client_received),
        // Add Watch only lets users pick wishlist or purchased — sold goes via Mark-Sold flow
        status:          ['wishlist','purchased'].includes(req.body.status) ? req.body.status : 'wishlist',
        image_path:      imageUrl,
      });
      const created = db.getWatch(id, uid(req));
      audit(req, { action: 'create', targetType: 'watch', targetId: id, details: { model: created.model, status: created.status, profile_id: created.profile_id } });
      notifier.onWatchCreated(created, profile);
      res.status(201).json(created);
    } catch (e) {
      return res.status(500).json({ error: e.message || 'Database error' });
    }
  });
});

module.exports = router;
