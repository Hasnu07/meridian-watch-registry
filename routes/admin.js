'use strict';

const express = require('express');
const bcrypt  = require('bcrypt');
const db      = require('../db');
const uid     = require('../lib/uid');

const router = express.Router();

// All routes here require master role
router.use((req, res, next) => {
  if (req.session?.user?.role !== 'master') {
    return res.status(403).json({ error: 'Master access required' });
  }
  next();
});

// Convenience for audit calls — actorId is the REAL session user (not the
// impersonated one), so master actions are always attributable.
const audit = (req, fields) => db.logAudit({
  actorId:       req.session.user.id,
  actorUsername: req.session.user.username,
  viewingAs:     req.session.viewing_as || null,
  ...fields,
});

// ── Users ────────────────────────────────────────────────────────────────

// GET /api/admin/users
router.get('/users', (req, res) => {
  res.json(db.listUsersWithStats());
});

const ROLES = ['admin', 'master', 'boutique_manager'];

// POST /api/admin/users { username, password, role, shop_id? }
// A boutique_manager needs shop_id: one shop of the workspace the master is
// currently in (their own, or the one they are viewing as). That workspace's
// owner becomes the manager's owner_id.
router.post('/users', async (req, res) => {
  const { username, password, role, shop_id } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  if (username.length < 3)    return res.status(400).json({ error: 'username must be at least 3 characters' });
  if (password.length < 6)    return res.status(400).json({ error: 'password must be at least 6 characters' });
  if (role && !ROLES.includes(role)) return res.status(400).json({ error: 'invalid role' });

  let ownerId = null, shopId = null;
  if (role === 'boutique_manager') {
    ownerId = uid(req);
    shopId  = Number(shop_id);
    if (!shopId) return res.status(400).json({ error: 'Choose the shop this boutique manager looks after' });
    if (!db.getShop(shopId, ownerId)) return res.status(404).json({ error: 'Shop not found in this workspace' });
  }

  // Username uniqueness check (DB has UNIQUE constraint too)
  if (db.getUserByUsername(username.trim())) {
    return res.status(409).json({ error: 'Username already taken' });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const id   = db.createUser({ username: username.trim(), passwordHash: hash, role: role || 'admin', ownerId, shopId });
    audit(req, { action: 'create', targetType: 'user', targetId: id, details: { username: username.trim(), role: role || 'admin', owner_id: ownerId, shop_id: shopId } });
    res.status(201).json({ id, username: username.trim(), role: role || 'admin', owner_id: ownerId, shop_id: shopId });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to create user' });
  }
});

// PUT /api/admin/users/:id { role } | { shop_id }
router.put('/users/:id', (req, res) => {
  const id   = Number(req.params.id);
  const user = db.getUserById(id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Boutique managers: only their shop can change (within the same registry).
  // They have no workspace, so they can never become admin/master and vice versa.
  if (user.role === 'boutique_manager' || req.body.role === 'boutique_manager') {
    if (req.body.role && req.body.role !== user.role) {
      return res.status(400).json({ error: 'A boutique manager account cannot change role — create a new user instead' });
    }
    if (req.body.shop_id !== undefined) {
      const shopId = Number(req.body.shop_id);
      if (!shopId || !db.getShop(shopId, user.owner_id)) return res.status(404).json({ error: 'Shop not found in that registry' });
      db.setUserShop(id, shopId);
      audit(req, { action: 'update', targetType: 'user', targetId: id, details: { shop_from: user.shop_id, shop_to: shopId } });
    }
    return res.json(db.getUserById(id));
  }

  // Master cannot demote themself (avoid lockout)
  if (id === req.session.user.id && req.body.role && req.body.role !== 'master') {
    return res.status(400).json({ error: 'You cannot demote yourself' });
  }
  if (req.body.role && !['admin', 'master'].includes(req.body.role)) {
    return res.status(400).json({ error: 'invalid role' });
  }
  if (req.body.role && req.body.role !== user.role) {
    db.updateUserRole(id, req.body.role);
    audit(req, { action: 'update', targetType: 'user', targetId: id, details: { from: user.role, to: req.body.role } });
  }
  res.json(db.getUserById(id));
});

// PUT /api/admin/users/:id/password { new_password }
router.put('/users/:id/password', async (req, res) => {
  const id   = Number(req.params.id);
  const user = db.getUserById(id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const { new_password } = req.body || {};
  if (!new_password || new_password.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }
  const hash = await bcrypt.hash(new_password, 10);
  db.setUserPassword(id, hash);
  audit(req, { action: 'password_reset', targetType: 'user', targetId: id, details: { username: user.username } });
  res.json({ ok: true });
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', (req, res) => {
  const id   = Number(req.params.id);
  const user = db.getUserById(id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (id === req.session.user.id) {
    return res.status(400).json({ error: 'You cannot delete yourself' });
  }
  // Refuse to delete the LAST master (prevents lock-out)
  if (user.role === 'master') {
    const masters = db.listUsers().filter(u => u.role === 'master');
    if (masters.length <= 1) return res.status(400).json({ error: 'Cannot delete the only master account' });
  }
  db.deleteUser(id);
  audit(req, { action: 'delete', targetType: 'user', targetId: id, details: { username: user.username, role: user.role } });
  res.json({ ok: true });
});

// ── Impersonation (view-as) ──────────────────────────────────────────────

// POST /api/admin/view-as { user_id }
router.post('/view-as', (req, res) => {
  const target_id = Number(req.body?.user_id);
  if (!target_id) return res.status(400).json({ error: 'user_id required' });
  const target = db.getUserById(target_id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.role === 'boutique_manager') {
    return res.status(400).json({ error: 'Boutique managers have no workspace of their own — they see one shop of their registry' });
  }
  req.session.viewing_as = target_id;
  audit(req, { action: 'view_as_start', targetType: 'user', targetId: target_id, details: { username: target.username } });
  res.json({ ok: true, viewing_as: { id: target.id, username: target.username, role: target.role } });
});

// POST /api/admin/view-as-self  — return to own workspace
router.post('/view-as-self', (req, res) => {
  if (req.session.viewing_as) {
    audit(req, { action: 'view_as_end', targetType: 'user', targetId: req.session.viewing_as });
  }
  req.session.viewing_as = null;
  res.json({ ok: true });
});

// ── Audit log ────────────────────────────────────────────────────────────

// GET /api/admin/audit-log?limit=200&offset=0&actor_id=1&target_type=watch&action=create
router.get('/audit-log', (req, res) => {
  const { limit, offset, actor_id, target_type, action } = req.query;
  const rows  = db.listAuditLog({ limit, offset, actorId: actor_id, targetType: target_type, action });
  const total = db.countAuditLog({ actorId: actor_id, targetType: target_type, action });
  res.json({ rows, total });
});

module.exports = router;
