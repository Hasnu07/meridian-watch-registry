'use strict';

/**
 * Idempotent seed of Robin's demo workspace.
 *
 * Creates:
 *   - BUCHERER BERN shop (if missing)
 *   - 5 master clients (Anastasio, Stevie, Djole, Pascal & Wendy, Jhonny/Robin)
 *   - Their shop memberships and watches (matches the spreadsheets)
 *
 * Every step checks for existence first, so it's safe to run on every boot.
 * If you delete a watch manually it will be re-created on the next deploy —
 * that's the intended behaviour for a "demo dataset". To stop the seeder
 * touching a tenant entirely, set the setting key `seed_demo_disabled`='1'.
 */

const { DatabaseSync } = require('node:sqlite');
const { DB_PATH } = require('../config');

function run(db) {
  const d = new DatabaseSync(DB_PATH);

  // Find robin (skip silently if user doesn't exist yet)
  const robin = db.getUserByUsername('robin');
  if (!robin) return;

  if (db.getSetting(robin.id, 'seed_demo_disabled') === '1') return;

  // ── 1. BUCHERER BERN shop ─────────────────────────────────────────────
  let bucherer = d.prepare("SELECT id FROM shops WHERE owner_id = ? AND name = 'BUCHERER BERN'").get(robin.id);
  if (!bucherer) {
    const id = db.createShop({
      name: 'BUCHERER BERN',
      address: 'Marktgasse 2\n3011 Bern\nSwitzerland',
      ownerId: robin.id,
    });
    bucherer = { id };
  }
  const huber    = d.prepare("SELECT id FROM shops WHERE owner_id = ? AND name LIKE '%HUBER%'").get(robin.id);
  const zigerli  = d.prepare("SELECT id FROM shops WHERE owner_id = ? AND name LIKE '%ZIGERLI%'").get(robin.id);
  if (!huber || !zigerli) return; // catalogue not seeded yet

  // ── 2. Helper: ensure a client + a per-shop membership exists ────────
  function ensureClient(name, opts = {}) {
    let c = d.prepare('SELECT id FROM clients WHERE owner_id = ? AND name = ?').get(robin.id, name);
    if (!c) {
      const id = db.createClient({ name, photo_path: null, ownerId: robin.id });
      c = { id };
    }
    return c.id;
  }
  function ensureMembership(clientId, shopId, opts = {}) {
    let p = d.prepare('SELECT id FROM profiles WHERE owner_id = ? AND client_id = ? AND shop_id = ?').get(robin.id, clientId, shopId);
    if (!p) {
      const id = db.createProfile({
        name:           opts.name || null,
        email:          null,
        client_id:      clientId,
        shop_id:        shopId,
        ownerId:        robin.id,
        trading_rule:   opts.trading_rule   || 'split',
        profit_split_me: opts.profit_split_me ?? 100,
        loss_split_me:   opts.loss_split_me   ?? 100,
      });
      p = { id };
    }
    return p.id;
  }
  const insWatch = d.prepare(`
    INSERT INTO watches (profile_id, model, source, status, purchase_date, list_price, sale_price, currency)
    VALUES (?, ?, 'Company', ?, ?, ?, ?, 'CHF')
  `);
  function ensureWatch(profileId, w) {
    // Match on (profile_id, model, status) — enough to dedupe in practice
    const found = d.prepare('SELECT id FROM watches WHERE profile_id = ? AND model = ? AND status = ?').get(profileId, w.model, w.status);
    if (found) return found.id;
    return insWatch.run(profileId, w.model, w.status, w.date ?? null, w.list ?? null, w.sale ?? null).lastInsertRowid;
  }

  // ── 3. Clients & memberships ─────────────────────────────────────────

  // Anastasio @ Huber
  const anastasio = ensureClient('Anastasio');
  const anastasioP = ensureMembership(anastasio, huber.id, { name: 'Anastasio' });
  [
    { model: '5905R',           status: 'sold',     date: '2026-01-26', list: 67700, sale: 46000 },
    { model: 'Hublot',          status: 'sold',     date: '2026-03-14', list: 26900, sale: 13000 },
    { model: '5990/1R',         status: 'wishlist', date: '2026-02-01' },
    { model: '126518 Tiffany',  status: 'wishlist', date: '2026-02-01' },
    { model: '126508 Yml',      status: 'wishlist', date: '2026-02-01' },
    { model: '4910 Grey',       status: 'wishlist', date: '2026-02-01' },
  ].forEach(w => ensureWatch(anastasioP, w));

  // Stevie @ Huber + Bucherer Bern
  const stevie = ensureClient('Stevie');
  const stevieHuber = ensureMembership(stevie, huber.id, { name: 'Stevie' });
  [
    { model: '5205R Green', status: 'sold',     date: '2026-04-01', list: 54300, sale: 41500 },
    { model: '5167R',       status: 'wishlist', date: '2026-04-01' },
    { model: '5740G',       status: 'wishlist', date: '2026-04-01' },
  ].forEach(w => ensureWatch(stevieHuber, w));
  const stevieBucherer = ensureMembership(stevie, bucherer.id, { name: 'Stevie' });
  ensureWatch(stevieBucherer, { model: 'Rolex 228235 Choco Diamond', status: 'sold', list: 50900, sale: 45500 });

  // Djole @ Huber
  const djole = ensureClient('Djole');
  const djoleP = ensureMembership(djole, huber.id, { name: 'Djole' });
  [
    { model: '5205G Blue', status: 'sold',     date: '2026-05-06', list: 54600, sale: 46000 },
    { model: '7128R',      status: 'wishlist', date: '2026-04-23' },
    { model: '5811G',      status: 'wishlist', date: '2026-04-23' },
  ].forEach(w => ensureWatch(djoleP, w));

  // Pascal & Wendy @ Zigerli
  const pw = ensureClient('Pascal & Wendy');
  const pwP = ensureMembership(pw, zigerli.id, { name: 'Pascal & Wendy' });
  [
    { model: 'Jewellery Ear rings', status: 'sold',     list: 7000, sale: 0 },
    { model: '126518LN YML',        status: 'wishlist', date: '2024-05-18' },
    { model: 'DDR Black ombre',     status: 'purchased', date: '2025-06-26', list: 44100 },
    { model: 'DJ36 Blue',           status: 'purchased', date: '2022-08-01', list: 8300 },
    { model: 'DJ41 Green',          status: 'purchased', date: '2023-02-25', list: 10000 },
    { model: '7118/1200A Blue',     status: 'purchased', date: '2026-04-30', list: 36600 },
  ].forEach(w => ensureWatch(pwP, w));

  // Jhonny/Robin partnership view (50/50 split) @ Huber + Bucherer Bern
  const jr = ensureClient('Jhonny/Robin');
  const jrHuber = ensureMembership(jr, huber.id, { name: 'Jhonny/Robin', profit_split_me: 50, loss_split_me: 50 });
  [
    { model: '5905R',       status: 'sold', date: '2026-01-26', list: 67700, sale: 46000 },
    { model: 'Hublot',      status: 'sold', date: '2026-01-26', list: 26900, sale: 13000 },
    { model: '5205R Green', status: 'sold', date: '2026-04-01', list: 54300, sale: 41500 },
    { model: '5396G',       status: 'sold', date: '2026-04-23', list: 57400, sale: 46000 },
  ].forEach(w => ensureWatch(jrHuber, w));
  const jrBucherer = ensureMembership(jr, bucherer.id, { name: 'Jhonny/Robin', profit_split_me: 50, loss_split_me: 50 });
  ensureWatch(jrBucherer, { model: '228235 Choco Diamond', status: 'sold', date: '2026-04-28', list: 50200, sale: 45500 });

  // Mark seeded (for diagnostics — never used to skip future runs, since the
  // function is fully idempotent on its own)
  db.setSetting(robin.id, 'seed_demo_last_run', new Date().toISOString());
}

module.exports = { run };
