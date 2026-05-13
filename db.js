'use strict';

const { DatabaseSync } = require('node:sqlite');
const path   = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');

const { DB_PATH } = require('./config');
const db = new DatabaseSync(DB_PATH);

const SHOPS_SEED = [
  { name: 'UNIÖN SUIZA',                 address: 'Via Augusta 1\n08006 Barcelona, Spain' },
  { name: 'BEYER CHRONOMETRIE AG',        address: 'Bahnhofstrasse 31\n8001 Zurich, Switzerland' },
  { name: 'ZIGERLI+IFF AG',               address: 'Spitalgasse 14\n3011 Bern, Switzerland' },
  { name: 'HUBER UHREN SCHMUCK ANSTALT',  address: '1m Städtle 34\n9490 Vaduz, Liechtenstein' },
  { name: 'PATEK PHILIPPE SALONS GENÈVE', address: 'Rue du Rhône 41\n1204 Geneva, Switzerland' },
  { name: 'PATEK PHILIPPE SALONS LONDON', address: '16 New Bond Street\nW1S 3SU London, United Kingdom' },
  { name: 'JAMIESON & CARRY',             address: '142, Union Street\nAB10 1GF Aberdeen, United Kingdom' },
];

function init() {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS admin (
      id            INTEGER PRIMARY KEY,
      password_hash TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS shops (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      address    TEXT,
      created_at DATETIME DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS profiles (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT NOT NULL,
      email         TEXT UNIQUE NOT NULL,
      address       TEXT,
      subscriber_id TEXT,
      pp_urn        TEXT,
      photo_path    TEXT,
      id_card_path  TEXT,
      created_at    DATETIME DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS watches (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id       INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      model            TEXT NOT NULL,
      serial_number    TEXT,
      source           TEXT CHECK(source IN ('Company','Dealer')) NOT NULL,
      purchase_date    DATE,
      price            REAL,
      reference_number TEXT,
      notes            TEXT,
      image_path       TEXT,
      created_at       DATETIME DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS portfolios (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      shop_id     INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
      share_token TEXT UNIQUE,
      created_at  DATETIME DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS clients (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      photo_path TEXT,
      created_at DATETIME DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS company_docs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      shop_name  TEXT NOT NULL,
      doc_path   TEXT NOT NULL,
      created_at DATETIME DEFAULT (datetime('now'))
    );
  `);

  // Migrate profiles columns
  const cols = db.prepare("PRAGMA table_info(profiles)").all().map(r => r.name);
  if (!cols.includes('subscriber_id')) db.exec("ALTER TABLE profiles ADD COLUMN subscriber_id TEXT");
  if (!cols.includes('pp_urn'))        db.exec("ALTER TABLE profiles ADD COLUMN pp_urn TEXT");
  if (!cols.includes('photo_path'))    db.exec("ALTER TABLE profiles ADD COLUMN photo_path TEXT");
  if (!cols.includes('title'))         db.exec("ALTER TABLE profiles ADD COLUMN title TEXT");
  if (!cols.includes('first_name'))    db.exec("ALTER TABLE profiles ADD COLUMN first_name TEXT");
  if (!cols.includes('last_name'))     db.exec("ALTER TABLE profiles ADD COLUMN last_name TEXT");
  if (!cols.includes('gender'))        db.exec("ALTER TABLE profiles ADD COLUMN gender TEXT");
  if (!cols.includes('dob'))           db.exec("ALTER TABLE profiles ADD COLUMN dob TEXT");
  if (!cols.includes('postal_code'))   db.exec("ALTER TABLE profiles ADD COLUMN postal_code TEXT");
  if (!cols.includes('city'))          db.exec("ALTER TABLE profiles ADD COLUMN city TEXT");
  if (!cols.includes('country'))       db.exec("ALTER TABLE profiles ADD COLUMN country TEXT");
  const shopIdMissing = !cols.includes('shop_id');
  if (shopIdMissing)                   db.exec("ALTER TABLE profiles ADD COLUMN shop_id INTEGER REFERENCES shops(id) ON DELETE SET NULL");
  if (!cols.includes('portfolio_id'))  db.exec("ALTER TABLE profiles ADD COLUMN portfolio_id INTEGER REFERENCES portfolios(id) ON DELETE SET NULL");
  if (!cols.includes('client_id')) {
    db.exec("ALTER TABLE profiles ADD COLUMN client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL");
    // Backfill: create a master client record for every existing profile
    const orphans = db.prepare("SELECT id, name, photo_path FROM profiles").all();
    const insClient  = db.prepare("INSERT INTO clients (name, photo_path) VALUES (?, ?)");
    const linkClient = db.prepare("UPDATE profiles SET client_id = ? WHERE id = ?");
    for (const p of orphans) {
      const cid = insClient.run(p.name, p.photo_path).lastInsertRowid;
      linkClient.run(cid, p.id);
    }
  }

  // Migrate portfolios columns
  const ptcols = db.prepare("PRAGMA table_info(portfolios)").all().map(r => r.name);
  if (!ptcols.includes('share_token')) db.exec("ALTER TABLE portfolios ADD COLUMN share_token TEXT");

  // Migrate watches columns
  const wcols = db.prepare("PRAGMA table_info(watches)").all().map(r => r.name);
  if (!wcols.includes('image_path'))      db.exec("ALTER TABLE watches ADD COLUMN image_path TEXT");
  if (!wcols.includes('movement_number')) db.exec("ALTER TABLE watches ADD COLUMN movement_number TEXT");
  if (!wcols.includes('case_number'))     db.exec("ALTER TABLE watches ADD COLUMN case_number TEXT");

  // Seed shops if none exist
  const shopCount = db.prepare('SELECT COUNT(*) as c FROM shops').get().c;
  if (shopCount === 0) {
    const insertShop = db.prepare('INSERT INTO shops (name, address) VALUES (?, ?)');
    SHOPS_SEED.forEach(s => insertShop.run(s.name, s.address));
  }

  // On first shop_id migration: assign all existing profiles to UNIÖN SUIZA
  if (shopIdMissing) {
    const unionSuiza = db.prepare("SELECT id FROM shops WHERE name = 'UNIÖN SUIZA'").get();
    if (unionSuiza) {
      db.prepare("UPDATE profiles SET shop_id = ? WHERE shop_id IS NULL").run(unionSuiza.id);
    }
  }

  // Always backfill: create master client for any profile still missing client_id
  {
    const orphans2 = db.prepare("SELECT id, name, photo_path FROM profiles WHERE client_id IS NULL").all();
    if (orphans2.length) {
      const insC2 = db.prepare("INSERT INTO clients (name, photo_path) VALUES (?, ?)");
      const lnkC2 = db.prepare("UPDATE profiles SET client_id = ? WHERE id = ?");
      for (const p of orphans2) {
        const cid = insC2.run(p.name, p.photo_path).lastInsertRowid;
        lnkC2.run(cid, p.id);
      }
    }
  }

  // Backfill share tokens for any portfolio that doesn't have one
  const unshared = db.prepare("SELECT id FROM portfolios WHERE share_token IS NULL").all();
  const backfill = db.prepare("UPDATE portfolios SET share_token = ? WHERE id = ?");
  for (const pt of unshared) backfill.run(crypto.randomBytes(32).toString('hex'), pt.id);

  // Seed admin row if missing
  const row = db.prepare('SELECT id FROM admin WHERE id = 1').get();
  if (!row) {
    const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123', 10);
    db.prepare('INSERT INTO admin (id, password_hash) VALUES (1, ?)').run(hash);
  }
}

// ── Admin ──────────────────────────────────────────────────────────────────

function getAdminHash() {
  return db.prepare('SELECT password_hash FROM admin WHERE id = 1').get()?.password_hash;
}

function setAdminPassword(hash) {
  db.prepare('UPDATE admin SET password_hash = ? WHERE id = 1').run(hash);
}

// ── Shops ──────────────────────────────────────────────────────────────────

function listShops() {
  return db.prepare(`
    SELECT s.*, COUNT(p.id) AS client_count
    FROM shops s
    LEFT JOIN profiles p ON p.shop_id = s.id
    GROUP BY s.id
    ORDER BY client_count DESC, s.name ASC
  `).all();
}

function getShop(id) {
  return db.prepare('SELECT * FROM shops WHERE id = ?').get(id);
}

function createShop({ name, address }) {
  const result = db.prepare('INSERT INTO shops (name, address) VALUES (?, ?)').run(name, address ?? null);
  return result.lastInsertRowid;
}

function updateShop(id, updates) {
  const fields = [], values = [];
  if (updates.name    !== undefined) { fields.push('name = ?');    values.push(updates.name); }
  if (updates.address !== undefined) { fields.push('address = ?'); values.push(updates.address); }
  if (!fields.length) return;
  values.push(id);
  db.prepare(`UPDATE shops SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

function deleteShop(id) {
  db.prepare('DELETE FROM shops WHERE id = ?').run(id);
}

function listProfilesForShop(shopId) {
  return db.prepare(`
    SELECT p.*, COUNT(w.id) AS watch_count,
           pt.name AS portfolio_name
    FROM profiles p
    LEFT JOIN watches w ON w.profile_id = p.id
    LEFT JOIN portfolios pt ON pt.id = p.portfolio_id
    WHERE p.shop_id = ?
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `).all(shopId);
}

function listIndividualProfilesForShop(shopId) {
  return db.prepare(`
    SELECT p.*, COUNT(w.id) AS watch_count
    FROM profiles p
    LEFT JOIN watches w ON w.profile_id = p.id
    WHERE p.shop_id = ? AND p.portfolio_id IS NULL
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `).all(shopId);
}

// ── Portfolios ─────────────────────────────────────────────────────────────

function listPortfolios(shopId) {
  return db.prepare(`
    SELECT pt.*,
           COUNT(DISTINCT p.id) AS client_count,
           COUNT(DISTINCT w.id) AS watch_count
    FROM portfolios pt
    LEFT JOIN profiles p ON p.portfolio_id = pt.id
    LEFT JOIN watches w ON w.profile_id = p.id
    WHERE pt.shop_id = ?
    GROUP BY pt.id
    ORDER BY pt.name ASC
  `).all(shopId);
}

function getPortfolio(id) {
  return db.prepare(`
    SELECT pt.*, s.name AS shop_name
    FROM portfolios pt
    LEFT JOIN shops s ON s.id = pt.shop_id
    WHERE pt.id = ?
  `).get(id);
}

function createPortfolio({ name, shop_id }) {
  const token  = crypto.randomBytes(32).toString('hex');
  const result = db.prepare('INSERT INTO portfolios (name, shop_id, share_token) VALUES (?, ?, ?)').run(name, Number(shop_id), token);
  return result.lastInsertRowid;
}

function updatePortfolio(id, { name }) {
  if (!name) return;
  db.prepare('UPDATE portfolios SET name = ? WHERE id = ?').run(name, id);
}

function deletePortfolio(id) {
  db.prepare('DELETE FROM portfolios WHERE id = ?').run(id);
}

function setPortfolioToken(id, token) {
  db.prepare('UPDATE portfolios SET share_token = ? WHERE id = ?').run(token, id);
}

function getPortfolioByToken(token) {
  return db.prepare(`
    SELECT pt.*, s.name AS shop_name
    FROM portfolios pt
    LEFT JOIN shops s ON s.id = pt.shop_id
    WHERE pt.share_token = ?
  `).get(token);
}

function listProfilesForPortfolio(portfolioId) {
  return db.prepare(`
    SELECT p.*, COUNT(w.id) AS watch_count
    FROM profiles p
    LEFT JOIN watches w ON w.profile_id = p.id
    WHERE p.portfolio_id = ?
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `).all(portfolioId);
}

// ── Master Clients ─────────────────────────────────────────────────────────

function listClients() {
  return db.prepare(`
    SELECT c.*, COUNT(DISTINCT p.id) AS membership_count, COUNT(DISTINCT w.id) AS watch_count
    FROM clients c
    LEFT JOIN profiles p ON p.client_id = c.id
    LEFT JOIN watches w  ON w.profile_id = p.id
    GROUP BY c.id
    ORDER BY c.name ASC
  `).all();
}

function getClient(id) {
  return db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
}

function getClientWithMemberships(id) {
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
  if (!client) return null;
  const memberships = db.prepare(`
    SELECT p.*, s.name AS shop_name, s.id AS shop_id_val, pt.name AS portfolio_name
    FROM profiles p
    LEFT JOIN shops s      ON s.id  = p.shop_id
    LEFT JOIN portfolios pt ON pt.id = p.portfolio_id
    WHERE p.client_id = ?
    ORDER BY p.created_at ASC
  `).all(id);
  memberships.forEach(m => {
    m.watches      = db.prepare('SELECT * FROM watches WHERE profile_id = ? ORDER BY created_at DESC').all(m.id);
    m.company_docs = db.prepare('SELECT * FROM company_docs WHERE profile_id = ? ORDER BY created_at DESC').all(m.id);
  });
  return { ...client, memberships };
}

function createClient({ name, photo_path }) {
  const result = db.prepare('INSERT INTO clients (name, photo_path) VALUES (?, ?)').run(name, photo_path ?? null);
  return result.lastInsertRowid;
}

function updateClient(id, updates) {
  const fields = [], values = [];
  if (updates.name       !== undefined) { fields.push('name = ?');       values.push(updates.name); }
  if (updates.photo_path !== undefined) { fields.push('photo_path = ?'); values.push(updates.photo_path); }
  if (!fields.length) return;
  values.push(id);
  db.prepare(`UPDATE clients SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  // Keep denormalised copies on profiles in sync
  if (updates.name       !== undefined) db.prepare("UPDATE profiles SET name       = ? WHERE client_id = ?").run(updates.name, id);
  if (updates.photo_path !== undefined) db.prepare("UPDATE profiles SET photo_path = ? WHERE client_id = ?").run(updates.photo_path, id);
}

function deleteClient(id) {
  // Delete all profile memberships (which cascade-deletes their watches via FK)
  db.prepare('DELETE FROM profiles WHERE client_id = ?').run(id);
  db.prepare('DELETE FROM clients WHERE id = ?').run(id);
}

// ── Profiles ───────────────────────────────────────────────────────────────

function listProfiles() {
  return db.prepare(`
    SELECT p.*, COUNT(w.id) AS watch_count, s.name AS shop_name
    FROM profiles p
    LEFT JOIN watches w ON w.profile_id = p.id
    LEFT JOIN shops s ON s.id = p.shop_id
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `).all();
}

function getProfile(id) {
  return db.prepare(`
    SELECT p.*, s.name AS shop_name
    FROM profiles p
    LEFT JOIN shops s ON s.id = p.shop_id
    WHERE p.id = ?
  `).get(id);
}

function createProfile({ name, email, address, subscriber_id, pp_urn, photo_path, id_card_path,
                          title, first_name, last_name, gender, dob, postal_code, city, country, shop_id, portfolio_id, client_id }) {
  const result = db.prepare(`
    INSERT INTO profiles
      (name, email, address, subscriber_id, pp_urn, photo_path, id_card_path,
       title, first_name, last_name, gender, dob, postal_code, city, country, shop_id, portfolio_id, client_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(name, email, address ?? null, subscriber_id ?? null, pp_urn ?? null,
         photo_path ?? null, id_card_path ?? null,
         title ?? null, first_name ?? null, last_name ?? null,
         gender ?? null, dob ?? null, postal_code ?? null, city ?? null, country ?? null,
         shop_id ?? null, portfolio_id ?? null, client_id ?? null);
  return result.lastInsertRowid;
}

function updateProfile(id, updates) {
  const FIELDS = ['name','email','address','subscriber_id','pp_urn','photo_path','id_card_path',
                  'title','first_name','last_name','gender','dob','postal_code','city','country','shop_id','portfolio_id','client_id'];
  const fields = [];
  const values = [];
  for (const f of FIELDS) {
    if (updates[f] !== undefined) { fields.push(`${f} = ?`); values.push(updates[f]); }
  }
  if (!fields.length) return;
  values.push(id);
  db.prepare(`UPDATE profiles SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

function deleteProfile(id) {
  db.prepare('DELETE FROM profiles WHERE id = ?').run(id);
}

// ── Watches ────────────────────────────────────────────────────────────────

function listWatchesForProfile(profileId) {
  return db.prepare(
    'SELECT * FROM watches WHERE profile_id = ? ORDER BY created_at DESC'
  ).all(profileId);
}

function listAllWatches({ q, source, profile_id } = {}) {
  let sql = `
    SELECT w.*, p.name AS client_name, p.email AS client_email
    FROM watches w
    JOIN profiles p ON p.id = w.profile_id
    WHERE 1=1
  `;
  const params = [];

  if (q) {
    sql += ` AND (w.model LIKE ? OR w.serial_number LIKE ? OR w.reference_number LIKE ? OR p.name LIKE ?)`;
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  if (source) {
    sql += ` AND w.source = ?`;
    params.push(source);
  }
  if (profile_id) {
    sql += ` AND w.profile_id = ?`;
    params.push(Number(profile_id));
  }

  sql += ' ORDER BY w.created_at DESC';
  return db.prepare(sql).all(...params);
}

function getWatch(id) {
  return db.prepare('SELECT * FROM watches WHERE id = ?').get(id);
}

function createWatch(profileId, { model, serial_number, source, purchase_date, price,
                                   reference_number, notes, image_path, movement_number, case_number }) {
  const result = db.prepare(`
    INSERT INTO watches
      (profile_id, model, serial_number, source, purchase_date, price,
       reference_number, notes, image_path, movement_number, case_number)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    profileId, model, serial_number ?? null, source,
    purchase_date ?? null, price != null ? Number(price) : null,
    reference_number ?? null, notes ?? null, image_path ?? null,
    movement_number ?? null, case_number ?? null
  );
  return result.lastInsertRowid;
}

function updateWatch(id, updates) {
  const FIELDS = ['model','serial_number','source','purchase_date','price',
                  'reference_number','notes','image_path','movement_number','case_number'];
  const fields = [];
  const values = [];
  for (const f of FIELDS) {
    if (updates[f] !== undefined) {
      fields.push(`${f} = ?`);
      values.push(f === 'price' ? (updates[f] != null && updates[f] !== '' ? Number(updates[f]) : null) : updates[f]);
    }
  }
  if (!fields.length) return;
  values.push(id);
  db.prepare(`UPDATE watches SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

function deleteWatch(id) {
  db.prepare('DELETE FROM watches WHERE id = ?').run(id);
}

// ── Company Docs ───────────────────────────────────────────────────────────

function listCompanyDocs(profileId) {
  return db.prepare('SELECT * FROM company_docs WHERE profile_id = ? ORDER BY created_at DESC').all(profileId);
}

function getCompanyDoc(id) {
  return db.prepare('SELECT * FROM company_docs WHERE id = ?').get(id);
}

function createCompanyDoc(profileId, { shop_name, doc_path }) {
  const result = db.prepare(
    'INSERT INTO company_docs (profile_id, shop_name, doc_path) VALUES (?, ?, ?)'
  ).run(profileId, shop_name, doc_path);
  return result.lastInsertRowid;
}

function deleteCompanyDoc(id) {
  db.prepare('DELETE FROM company_docs WHERE id = ?').run(id);
}

function getStats() {
  const { total_profiles } = db.prepare('SELECT COUNT(*) AS total_profiles FROM profiles').get();
  const { total_watches }  = db.prepare('SELECT COUNT(*) AS total_watches  FROM watches').get();
  const { company_watches } = db.prepare("SELECT COUNT(*) AS company_watches FROM watches WHERE source = 'Company'").get();
  const { dealer_watches }  = db.prepare("SELECT COUNT(*) AS dealer_watches  FROM watches WHERE source = 'Dealer'").get();
  const { total_value }    = db.prepare('SELECT COALESCE(SUM(price), 0) AS total_value FROM watches').get();
  return { total_profiles, total_watches, company_watches, dealer_watches, total_value };
}

module.exports = {
  init,
  getAdminHash, setAdminPassword,
  listShops, getShop, createShop, updateShop, deleteShop, listProfilesForShop, listIndividualProfilesForShop,
  listPortfolios, getPortfolio, createPortfolio, updatePortfolio, deletePortfolio, listProfilesForPortfolio, setPortfolioToken, getPortfolioByToken,
  listClients, getClient, getClientWithMemberships, createClient, updateClient, deleteClient,
  listProfiles, getProfile, createProfile, updateProfile, deleteProfile,
  listWatchesForProfile, listAllWatches, getWatch, createWatch, updateWatch, deleteWatch,
  listCompanyDocs, getCompanyDoc, createCompanyDoc, deleteCompanyDoc,
  getStats,
};
