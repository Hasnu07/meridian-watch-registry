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

    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'admin',
      created_at    DATETIME DEFAULT (datetime('now'))
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
      master_id  TEXT UNIQUE,
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

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS loss_payments (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      watch_id   INTEGER NOT NULL REFERENCES watches(id) ON DELETE CASCADE,
      date       DATE    NOT NULL,
      amount     REAL    NOT NULL,
      method     TEXT    DEFAULT 'BANK_TRANSFER',
      notes      TEXT,
      reversed   INTEGER DEFAULT 0,
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

  // Migrate profiles — trading terms + capital
  const pcols2 = db.prepare("PRAGMA table_info(profiles)").all().map(r => r.name);
  if (!pcols2.includes('profit_split_me'))  db.exec("ALTER TABLE profiles ADD COLUMN profit_split_me  INTEGER DEFAULT 100");
  if (!pcols2.includes('loss_split_me'))    db.exec("ALTER TABLE profiles ADD COLUMN loss_split_me    INTEGER DEFAULT 100");
  if (!pcols2.includes('my_capital'))       db.exec("ALTER TABLE profiles ADD COLUMN my_capital       REAL DEFAULT 0");
  if (!pcols2.includes('my_remaining'))     db.exec("ALTER TABLE profiles ADD COLUMN my_remaining     REAL DEFAULT 0");
  if (!pcols2.includes('client_capital'))   db.exec("ALTER TABLE profiles ADD COLUMN client_capital   REAL DEFAULT 0");
  if (!pcols2.includes('client_remaining')) db.exec("ALTER TABLE profiles ADD COLUMN client_remaining REAL DEFAULT 0");
  if (!pcols2.includes('trading_rule'))   db.exec("ALTER TABLE profiles ADD COLUMN trading_rule TEXT DEFAULT 'split'");
  if (!pcols2.includes('discount_split')) db.exec("ALTER TABLE profiles ADD COLUMN discount_split REAL DEFAULT 0.08");

  // Migrate watches — list/sale price + status + currency
  const wcols2 = db.prepare("PRAGMA table_info(watches)").all().map(r => r.name);
  if (!wcols2.includes('list_price'))           db.exec("ALTER TABLE watches ADD COLUMN list_price REAL");
  if (!wcols2.includes('sale_price'))           db.exec("ALTER TABLE watches ADD COLUMN sale_price REAL");
  if (!wcols2.includes('status'))               db.exec("ALTER TABLE watches ADD COLUMN status TEXT DEFAULT 'wishlist'");
  if (!wcols2.includes('currency'))             db.exec("ALTER TABLE watches ADD COLUMN currency TEXT DEFAULT 'CHF'");
  if (!wcols2.includes('sold_to'))              db.exec("ALTER TABLE watches ADD COLUMN sold_to TEXT");
  if (!wcols2.includes('my_cost'))              db.exec("ALTER TABLE watches ADD COLUMN my_cost REAL");
  if (!wcols2.includes('client_cost'))          db.exec("ALTER TABLE watches ADD COLUMN client_cost REAL");
  if (!wcols2.includes('loss_status'))          db.exec("ALTER TABLE watches ADD COLUMN loss_status TEXT DEFAULT 'open'");
  if (!wcols2.includes('discount_rate_applied')) db.exec("ALTER TABLE watches ADD COLUMN discount_rate_applied REAL");
  // Rename legacy 'pipeline' status to 'wishlist'
  db.exec("UPDATE watches SET status = 'wishlist' WHERE status = 'pipeline'");

  // Profiles email: drop NOT NULL + drop global UNIQUE in favour of per-owner UNIQUE.
  // We detect "needs rebuild" two ways:
  //   1) email column is still NOT NULL  (very old schema)
  //   2) email column is still global UNIQUE (intermediate schema)
  // After rebuild we add a partial UNIQUE INDEX on (owner_id, email).
  const profileSchemaSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='profiles'").get()?.sql || '';
  const emailCol = db.prepare("PRAGMA table_info(profiles)").all().find(c => c.name === 'email');
  const emailIsNotNull = emailCol && emailCol.notnull;
  const emailIsGloballyUnique = /email\s+TEXT\s+UNIQUE/i.test(profileSchemaSql);
  if (emailIsNotNull || emailIsGloballyUnique) {
    const allCols = db.prepare("PRAGMA table_info(profiles)").all();
    const colDefs = allCols.map(c => {
      if (c.pk)               return `${c.name} INTEGER PRIMARY KEY AUTOINCREMENT`;
      if (c.name === 'email') return 'email TEXT';   // no NOT NULL, no UNIQUE
      let def = `${c.name} ${c.type || ''}`.trim();
      if (c.notnull) def += ' NOT NULL';
      if (c.dflt_value != null) {
        const needsParens = /[()]/.test(c.dflt_value);
        def += ` DEFAULT ${needsParens ? `(${c.dflt_value})` : c.dflt_value}`;
      }
      return def;
    });
    const fkClauses = [
      'FOREIGN KEY (shop_id)      REFERENCES shops(id)      ON DELETE SET NULL',
      'FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE SET NULL',
      'FOREIGN KEY (client_id)    REFERENCES clients(id)    ON DELETE SET NULL',
    ];
    const colList = allCols.map(c => c.name).join(', ');

    db.exec('PRAGMA foreign_keys = OFF');
    db.exec('BEGIN TRANSACTION');
    db.exec(`CREATE TABLE profiles_new (${colDefs.join(', ')}, ${fkClauses.join(', ')})`);
    db.exec(`INSERT INTO profiles_new (${colList}) SELECT ${colList} FROM profiles`);
    db.exec('DROP TABLE profiles');
    db.exec('ALTER TABLE profiles_new RENAME TO profiles');
    db.exec('COMMIT');
    db.exec('PRAGMA foreign_keys = ON');
  }
  // Per-owner email uniqueness (NULL emails are ignored — SQLite indices treat NULL as distinct)
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_owner_email ON profiles (owner_id, email) WHERE email IS NOT NULL");

  // Drop the legacy single-password admin table if it still exists
  db.exec("DROP TABLE IF EXISTS admin");

  // Migrate clients columns — add master_id if missing
  const clientCols = db.prepare("PRAGMA table_info(clients)").all().map(r => r.name);
  if (!clientCols.includes('master_id')) {
    db.exec("ALTER TABLE clients ADD COLUMN master_id TEXT");
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_master_id ON clients (master_id)");
    // Backfill: assign 001, 002, 003… ordered by id
    const allC = db.prepare("SELECT id FROM clients ORDER BY id ASC").all();
    const setMid = db.prepare("UPDATE clients SET master_id = ? WHERE id = ?");
    allC.forEach((c, i) => setMid.run(String(i + 1).padStart(3, '0'), c.id));
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

  // ── Seed user accounts (multi-tenancy) ───────────────────────────────────
  function ensureUser(username, password, role) {
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) return existing.id;
    const hash = bcrypt.hashSync(password, 10);
    const r = db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(username, hash, role);
    return r.lastInsertRowid;
  }
  const JHONNY_ID = ensureUser('jhonny', 'Pakistan@125', 'admin');
  const ROBIN_ID  = ensureUser('robin',  'Robin@123',    'admin');

  // ── Add owner_id to top-level tables ─────────────────────────────────────
  function addOwnerCol(table, defaultOwner) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
    if (!cols.includes('owner_id')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE`);
      db.prepare(`UPDATE ${table} SET owner_id = ? WHERE owner_id IS NULL`).run(defaultOwner);
    }
  }
  // All existing data belongs to jhonny — the original owner of the registry
  addOwnerCol('shops',      JHONNY_ID);
  addOwnerCol('clients',    JHONNY_ID);
  addOwnerCol('portfolios', JHONNY_ID);
  addOwnerCol('profiles',   JHONNY_ID);

  // ── Settings: rebuild as per-user key/value store ────────────────────────
  // Old: PRIMARY KEY (key). New: PRIMARY KEY (user_id, key)
  const settingsCols = db.prepare("PRAGMA table_info(settings)").all().map(c => c.name);
  if (!settingsCols.includes('user_id')) {
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec('BEGIN TRANSACTION');
    db.exec(`
      CREATE TABLE settings_new (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        key     TEXT    NOT NULL,
        value   TEXT,
        PRIMARY KEY (user_id, key)
      );
    `);
    // Migrate existing global settings → jhonny's account
    const existing = db.prepare('SELECT key, value FROM settings').all();
    const insStmt  = db.prepare('INSERT OR REPLACE INTO settings_new (user_id, key, value) VALUES (?, ?, ?)');
    for (const s of existing) insStmt.run(JHONNY_ID, s.key, s.value);
    db.exec('DROP TABLE settings');
    db.exec('ALTER TABLE settings_new RENAME TO settings');
    db.exec('COMMIT');
    db.exec('PRAGMA foreign_keys = ON');
  }

  // ── Per-user shop seeding ────────────────────────────────────────────────
  // Every user who has zero shops gets the default catalogue. This way Robin
  // starts with the same boutique list jhonny had, but in his own namespace.
  function seedShopsForUser(userId) {
    const count = db.prepare('SELECT COUNT(*) AS c FROM shops WHERE owner_id = ?').get(userId).c;
    if (count > 0) return;
    const ins = db.prepare('INSERT INTO shops (name, address, owner_id) VALUES (?, ?, ?)');
    SHOPS_SEED.forEach(s => ins.run(s.name, s.address, userId));
  }
  seedShopsForUser(JHONNY_ID);
  seedShopsForUser(ROBIN_ID);
}

// ── Users (multi-tenant accounts) ─────────────────────────────────────────

function getUserByUsername(username) {
  return db.prepare('SELECT id, username, password_hash, role, created_at FROM users WHERE username = ?').get(username);
}

function getUserById(id) {
  return db.prepare('SELECT id, username, role, created_at FROM users WHERE id = ?').get(id);
}

function setUserPassword(id, hash) {
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, id);
}

function listUsers() {
  return db.prepare('SELECT id, username, role FROM users ORDER BY username ASC').all();
}

// ── Shops ─────────────────────────────────────────────────────────────────
// Every list/get/update/delete is owner-scoped. Create stamps owner_id.

function listShops(ownerId) {
  return db.prepare(`
    SELECT s.*, COUNT(p.id) AS client_count
    FROM shops s
    LEFT JOIN profiles p ON p.shop_id = s.id AND p.owner_id = s.owner_id
    WHERE s.owner_id = ?
    GROUP BY s.id
    ORDER BY client_count DESC, s.name ASC
  `).all(ownerId);
}

function getShop(id, ownerId) {
  return db.prepare('SELECT * FROM shops WHERE id = ? AND owner_id = ?').get(id, ownerId);
}

function createShop({ name, address, ownerId }) {
  const result = db.prepare('INSERT INTO shops (name, address, owner_id) VALUES (?, ?, ?)').run(name, address ?? null, ownerId);
  return result.lastInsertRowid;
}

function updateShop(id, updates, ownerId) {
  const fields = [], values = [];
  if (updates.name    !== undefined) { fields.push('name = ?');    values.push(updates.name); }
  if (updates.address !== undefined) { fields.push('address = ?'); values.push(updates.address); }
  if (!fields.length) return;
  values.push(id, ownerId);
  db.prepare(`UPDATE shops SET ${fields.join(', ')} WHERE id = ? AND owner_id = ?`).run(...values);
}

function deleteShop(id, ownerId) {
  db.prepare('DELETE FROM shops WHERE id = ? AND owner_id = ?').run(id, ownerId);
}

function listProfilesForShop(shopId, ownerId) {
  return db.prepare(`
    SELECT p.*, COUNT(w.id) AS watch_count,
           pt.name AS portfolio_name
    FROM profiles p
    LEFT JOIN watches w ON w.profile_id = p.id
    LEFT JOIN portfolios pt ON pt.id = p.portfolio_id
    WHERE p.shop_id = ? AND p.owner_id = ?
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `).all(shopId, ownerId);
}

function listIndividualProfilesForShop(shopId, ownerId) {
  return db.prepare(`
    SELECT p.*, COUNT(w.id) AS watch_count
    FROM profiles p
    LEFT JOIN watches w ON w.profile_id = p.id
    WHERE p.shop_id = ? AND p.portfolio_id IS NULL AND p.owner_id = ?
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `).all(shopId, ownerId);
}

// ── Portfolios ────────────────────────────────────────────────────────────

function listPortfolios(shopId, ownerId) {
  return db.prepare(`
    SELECT pt.*,
           COUNT(DISTINCT p.id) AS client_count,
           COUNT(DISTINCT w.id) AS watch_count
    FROM portfolios pt
    LEFT JOIN profiles p ON p.portfolio_id = pt.id
    LEFT JOIN watches w ON w.profile_id = p.id
    WHERE pt.shop_id = ? AND pt.owner_id = ?
    GROUP BY pt.id
    ORDER BY pt.name ASC
  `).all(shopId, ownerId);
}

function getPortfolio(id, ownerId) {
  return db.prepare(`
    SELECT pt.*, s.name AS shop_name
    FROM portfolios pt
    LEFT JOIN shops s ON s.id = pt.shop_id
    WHERE pt.id = ? AND pt.owner_id = ?
  `).get(id, ownerId);
}

function createPortfolio({ name, shop_id, ownerId }) {
  const token  = crypto.randomBytes(32).toString('hex');
  const result = db.prepare('INSERT INTO portfolios (name, shop_id, share_token, owner_id) VALUES (?, ?, ?, ?)').run(name, Number(shop_id), token, ownerId);
  return result.lastInsertRowid;
}

function updatePortfolio(id, { name }, ownerId) {
  if (!name) return;
  db.prepare('UPDATE portfolios SET name = ? WHERE id = ? AND owner_id = ?').run(name, id, ownerId);
}

function deletePortfolio(id, ownerId) {
  db.prepare('DELETE FROM portfolios WHERE id = ? AND owner_id = ?').run(id, ownerId);
}

function setPortfolioToken(id, token, ownerId) {
  db.prepare('UPDATE portfolios SET share_token = ? WHERE id = ? AND owner_id = ?').run(token, id, ownerId);
}

// PUBLIC: portfolio share link — no auth, no ownership check
function getPortfolioByToken(token) {
  return db.prepare(`
    SELECT pt.*, s.name AS shop_name
    FROM portfolios pt
    LEFT JOIN shops s ON s.id = pt.shop_id
    WHERE pt.share_token = ?
  `).get(token);
}

function listProfilesForPortfolio(portfolioId) {
  // Used both by the authenticated portfolio detail view and the public
  // share link. Ownership is enforced by getPortfolio()/getPortfolioByToken()
  // upstream, so we don't filter here.
  return db.prepare(`
    SELECT p.*, COUNT(w.id) AS watch_count
    FROM profiles p
    LEFT JOIN watches w ON w.profile_id = p.id
    WHERE p.portfolio_id = ?
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `).all(portfolioId);
}

// ── Master Clients ────────────────────────────────────────────────────────

function listClients(ownerId) {
  return db.prepare(`
    SELECT c.*, COUNT(DISTINCT p.id) AS membership_count, COUNT(DISTINCT w.id) AS watch_count
    FROM clients c
    LEFT JOIN profiles p ON p.client_id = c.id
    LEFT JOIN watches w  ON w.profile_id = p.id
    WHERE c.owner_id = ?
    GROUP BY c.id
    ORDER BY c.name ASC
  `).all(ownerId);
}

function getClient(id, ownerId) {
  return db.prepare('SELECT * FROM clients WHERE id = ? AND owner_id = ?').get(id, ownerId);
}

function getClientWithMemberships(id, ownerId) {
  const client = db.prepare('SELECT * FROM clients WHERE id = ? AND owner_id = ?').get(id, ownerId);
  if (!client) return null;
  const memberships = db.prepare(`
    SELECT p.*, s.name AS shop_name, s.id AS shop_id_val, pt.name AS portfolio_name
    FROM profiles p
    LEFT JOIN shops s      ON s.id  = p.shop_id
    LEFT JOIN portfolios pt ON pt.id = p.portfolio_id
    WHERE p.client_id = ? AND p.owner_id = ?
    ORDER BY p.created_at ASC
  `).all(id, ownerId);
  memberships.forEach(m => {
    const raw = db.prepare('SELECT * FROM watches WHERE profile_id = ? ORDER BY created_at DESC').all(m.id);
    m.watches      = raw.map(w => ({ ...w, loss_payments: listLossPayments(w.id) }));
    m.company_docs = db.prepare('SELECT * FROM company_docs WHERE profile_id = ? ORDER BY created_at DESC').all(m.id);
  });
  return { ...client, memberships };
}

function createClient({ name, photo_path, ownerId }) {
  const result = db.prepare('INSERT INTO clients (name, photo_path, owner_id) VALUES (?, ?, ?)').run(name, photo_path ?? null, ownerId);
  const id = result.lastInsertRowid;
  db.prepare("UPDATE clients SET master_id = ? WHERE id = ? AND master_id IS NULL")
    .run(String(id).padStart(3, '0'), id);
  return id;
}

function updateClient(id, updates, ownerId) {
  const fields = [], values = [];
  if (updates.name       !== undefined) { fields.push('name = ?');       values.push(updates.name); }
  if (updates.photo_path !== undefined) { fields.push('photo_path = ?'); values.push(updates.photo_path); }
  if (updates.master_id  !== undefined) { fields.push('master_id = ?');  values.push(updates.master_id); }
  if (!fields.length) return;
  values.push(id, ownerId);
  db.prepare(`UPDATE clients SET ${fields.join(', ')} WHERE id = ? AND owner_id = ?`).run(...values);
  // Keep denormalised copies on profiles in sync (scoped to same owner)
  if (updates.name       !== undefined) db.prepare("UPDATE profiles SET name       = ? WHERE client_id = ? AND owner_id = ?").run(updates.name, id, ownerId);
  if (updates.photo_path !== undefined) db.prepare("UPDATE profiles SET photo_path = ? WHERE client_id = ? AND owner_id = ?").run(updates.photo_path, id, ownerId);
}

function getClientByMasterId(masterId, ownerId) {
  return db.prepare('SELECT * FROM clients WHERE master_id = ? AND owner_id = ?').get(masterId, ownerId);
}

function deleteClient(id, ownerId) {
  db.prepare('DELETE FROM profiles WHERE client_id = ? AND owner_id = ?').run(id, ownerId);
  db.prepare('DELETE FROM clients WHERE id = ? AND owner_id = ?').run(id, ownerId);
}

// ── Profiles ──────────────────────────────────────────────────────────────

function listProfiles(ownerId) {
  return db.prepare(`
    SELECT p.*, COUNT(w.id) AS watch_count, s.name AS shop_name
    FROM profiles p
    LEFT JOIN watches w ON w.profile_id = p.id
    LEFT JOIN shops s ON s.id = p.shop_id
    WHERE p.owner_id = ?
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `).all(ownerId);
}

function getProfile(id, ownerId) {
  return db.prepare(`
    SELECT p.*, s.name AS shop_name
    FROM profiles p
    LEFT JOIN shops s ON s.id = p.shop_id
    WHERE p.id = ? AND p.owner_id = ?
  `).get(id, ownerId);
}

function createProfile({ name, email, address, subscriber_id, pp_urn, photo_path, id_card_path,
                          title, first_name, last_name, gender, dob, postal_code, city, country,
                          shop_id, portfolio_id, client_id,
                          profit_split_me, loss_split_me,
                          my_capital, my_remaining, client_capital, client_remaining,
                          trading_rule, discount_split, ownerId }) {
  const result = db.prepare(`
    INSERT INTO profiles
      (name, email, address, subscriber_id, pp_urn, photo_path, id_card_path,
       title, first_name, last_name, gender, dob, postal_code, city, country,
       shop_id, portfolio_id, client_id,
       profit_split_me, loss_split_me, my_capital, my_remaining, client_capital, client_remaining,
       trading_rule, discount_split, owner_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(name, email, address ?? null, subscriber_id ?? null, pp_urn ?? null,
         photo_path ?? null, id_card_path ?? null,
         title ?? null, first_name ?? null, last_name ?? null,
         gender ?? null, dob ?? null, postal_code ?? null, city ?? null, country ?? null,
         shop_id ?? null, portfolio_id ?? null, client_id ?? null,
         profit_split_me ?? 100, loss_split_me ?? 100,
         my_capital ?? 0, my_remaining ?? 0, client_capital ?? 0, client_remaining ?? 0,
         trading_rule ?? 'split', discount_split ?? 0.08, ownerId);
  return result.lastInsertRowid;
}

function updateProfile(id, updates, ownerId) {
  const FIELDS = ['name','email','address','subscriber_id','pp_urn','photo_path','id_card_path',
                  'title','first_name','last_name','gender','dob','postal_code','city','country',
                  'shop_id','portfolio_id','client_id',
                  'profit_split_me','loss_split_me','my_capital','my_remaining','client_capital','client_remaining',
                  'trading_rule','discount_split'];
  const fields = [];
  const values = [];
  for (const f of FIELDS) {
    if (updates[f] !== undefined) { fields.push(`${f} = ?`); values.push(updates[f]); }
  }
  if (!fields.length) return;
  values.push(id, ownerId);
  db.prepare(`UPDATE profiles SET ${fields.join(', ')} WHERE id = ? AND owner_id = ?`).run(...values);
}

function deleteProfile(id, ownerId) {
  db.prepare('DELETE FROM profiles WHERE id = ? AND owner_id = ?').run(id, ownerId);
}

// ── Watches ───────────────────────────────────────────────────────────────
// Watch ownership inherited from profile.owner_id. Every authenticated
// query JOINs profiles to enforce this. `ownerId` is mandatory.

function listWatchesForProfile(profileId, ownerId) {
  if (ownerId == null) {
    // Public share path — profile ownership is verified upstream
    return db.prepare('SELECT * FROM watches WHERE profile_id = ? ORDER BY created_at DESC').all(profileId);
  }
  return db.prepare(`
    SELECT w.* FROM watches w
    JOIN profiles p ON p.id = w.profile_id
    WHERE w.profile_id = ? AND p.owner_id = ?
    ORDER BY w.created_at DESC
  `).all(profileId, ownerId);
}

function listAllWatches({ q, source, profile_id, ownerId } = {}) {
  let sql = `
    SELECT w.*, p.name AS client_name, p.email AS client_email,
           p.profit_split_me, p.loss_split_me,
           s.name AS shop_name
    FROM watches w
    JOIN profiles p ON p.id = w.profile_id
    LEFT JOIN shops s ON s.id = p.shop_id
    WHERE p.owner_id = ?
  `;
  const params = [ownerId];

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

function getWatch(id, ownerId) {
  if (ownerId == null) {
    return db.prepare('SELECT * FROM watches WHERE id = ?').get(id);
  }
  return db.prepare(`
    SELECT w.* FROM watches w
    JOIN profiles p ON p.id = w.profile_id
    WHERE w.id = ? AND p.owner_id = ?
  `).get(id, ownerId);
}

function createWatch(profileId, { model, serial_number, source, purchase_date, price,
                                   reference_number, notes, image_path, movement_number, case_number,
                                   list_price, sale_price, status, currency, my_cost, client_cost }) {
  // Caller has already verified profileId belongs to current user
  const result = db.prepare(`
    INSERT INTO watches
      (profile_id, model, serial_number, source, purchase_date, price,
       reference_number, notes, image_path, movement_number, case_number,
       list_price, sale_price, status, currency, my_cost, client_cost)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    profileId, model, serial_number ?? null, source,
    purchase_date ?? null, price != null ? Number(price) : null,
    reference_number ?? null, notes ?? null, image_path ?? null,
    movement_number ?? null, case_number ?? null,
    list_price  != null ? Number(list_price)  : null,
    sale_price  != null ? Number(sale_price)  : null,
    status ?? 'wishlist',
    currency ?? 'CHF',
    my_cost     != null ? Number(my_cost)     : null,
    client_cost != null ? Number(client_cost) : null
  );
  return result.lastInsertRowid;
}

function updateWatch(id, updates, ownerId) {
  const FIELDS = ['model','serial_number','source','purchase_date','price',
                  'reference_number','notes','image_path','movement_number','case_number',
                  'list_price','sale_price','status','currency','sold_to',
                  'my_cost','client_cost','loss_status','discount_rate_applied'];
  const setParts = [];
  const values = [];
  for (const f of FIELDS) {
    if (updates[f] !== undefined) {
      setParts.push(`w.${f} = ?`);
      const numericFields = ['price','list_price','sale_price','discount_rate_applied'];
      values.push(numericFields.includes(f) ? (updates[f] != null && updates[f] !== '' ? Number(updates[f]) : null) : updates[f]);
    }
  }
  if (!setParts.length) return;
  // SQLite UPDATE-with-JOIN substitute: scope via subquery
  const sql = `UPDATE watches SET ${setParts.map(s => s.replace(/^w\./, '')).join(', ')}
               WHERE id = ? AND profile_id IN (SELECT id FROM profiles WHERE owner_id = ?)`;
  values.push(id, ownerId);
  db.prepare(sql).run(...values);
}

function deleteWatch(id, ownerId) {
  db.prepare(
    'DELETE FROM watches WHERE id = ? AND profile_id IN (SELECT id FROM profiles WHERE owner_id = ?)'
  ).run(id, ownerId);
}

// ── Company Docs ──────────────────────────────────────────────────────────

function listCompanyDocs(profileId, ownerId) {
  if (ownerId == null) {
    return db.prepare('SELECT * FROM company_docs WHERE profile_id = ? ORDER BY created_at DESC').all(profileId);
  }
  return db.prepare(`
    SELECT cd.* FROM company_docs cd
    JOIN profiles p ON p.id = cd.profile_id
    WHERE cd.profile_id = ? AND p.owner_id = ?
    ORDER BY cd.created_at DESC
  `).all(profileId, ownerId);
}

function getCompanyDoc(id, ownerId) {
  if (ownerId == null) {
    return db.prepare('SELECT * FROM company_docs WHERE id = ?').get(id);
  }
  return db.prepare(`
    SELECT cd.* FROM company_docs cd
    JOIN profiles p ON p.id = cd.profile_id
    WHERE cd.id = ? AND p.owner_id = ?
  `).get(id, ownerId);
}

function createCompanyDoc(profileId, { shop_name, doc_path }) {
  const result = db.prepare(
    'INSERT INTO company_docs (profile_id, shop_name, doc_path) VALUES (?, ?, ?)'
  ).run(profileId, shop_name, doc_path);
  return result.lastInsertRowid;
}

function deleteCompanyDoc(id, ownerId) {
  db.prepare(
    'DELETE FROM company_docs WHERE id = ? AND profile_id IN (SELECT id FROM profiles WHERE owner_id = ?)'
  ).run(id, ownerId);
}

function getStats(ownerId) {
  // Counts (currency-agnostic)
  const counts = db.prepare(`
    SELECT
      COUNT(DISTINCT p.id)                                              AS total_profiles,
      COUNT(w.id)                                                       AS total_watches,
      SUM(CASE WHEN w.status = 'wishlist'  THEN 1 ELSE 0 END)           AS wishlist_count,
      SUM(CASE WHEN w.status = 'purchased' THEN 1 ELSE 0 END)           AS purchased_count,
      SUM(CASE WHEN w.status = 'sold'      THEN 1 ELSE 0 END)           AS sold_count
    FROM profiles p
    LEFT JOIN watches w ON w.profile_id = p.id
    WHERE p.owner_id = ?
  `).get(ownerId);

  // Money sums grouped by currency so the frontend never mixes apples and
  // oranges. Each row contributes only to its own currency bucket.
  const moneyRows = db.prepare(`
    SELECT
      COALESCE(w.currency, 'CHF') AS currency,
      COALESCE(SUM(CASE WHEN w.status = 'purchased' THEN w.list_price ELSE 0 END), 0) AS active_list_value,
      COALESCE(SUM(CASE WHEN w.status = 'wishlist'  THEN w.list_price ELSE 0 END), 0) AS wishlist_list_value,
      COALESCE(SUM(CASE WHEN w.status = 'sold'      THEN w.sale_price ELSE 0 END), 0) AS total_sale_value,
      COALESCE(SUM(CASE WHEN w.status = 'sold' AND w.list_price IS NOT NULL AND w.sale_price IS NOT NULL
                        THEN (w.sale_price - w.list_price) ELSE 0 END), 0)            AS net_pnl,
      COALESCE(SUM(CASE WHEN w.status IN ('purchased','sold') THEN w.my_cost     ELSE 0 END), 0) AS my_total_cost,
      COALESCE(SUM(CASE WHEN w.status IN ('purchased','sold') THEN w.client_cost ELSE 0 END), 0) AS client_total_cost
    FROM watches w
    JOIN profiles p ON p.id = w.profile_id
    WHERE p.owner_id = ? AND w.id IS NOT NULL
    GROUP BY COALESCE(w.currency, 'CHF')
  `).all(ownerId);

  // Build { CHF: 10000, EUR: 2500 } maps. Empty result = empty map.
  const groupMap = key => {
    const m = {};
    for (const r of moneyRows) if (r[key]) m[r.currency] = (m[r.currency] || 0) + r[key];
    return m;
  };
  const active_list_value   = groupMap('active_list_value');
  const wishlist_list_value = groupMap('wishlist_list_value');
  const total_sale_value    = groupMap('total_sale_value');
  const net_pnl             = groupMap('net_pnl');
  const my_total_cost       = groupMap('my_total_cost');
  const client_total_cost   = groupMap('client_total_cost');

  // total_value = active list + sold proceeds (per currency)
  const total_value = {};
  for (const cur of new Set([...Object.keys(active_list_value), ...Object.keys(total_sale_value)])) {
    total_value[cur] = (active_list_value[cur] || 0) + (total_sale_value[cur] || 0);
  }

  return {
    total_profiles:  counts.total_profiles  || 0,
    total_watches:   counts.total_watches   || 0,
    wishlist_count:  counts.wishlist_count  || 0,
    purchased_count: counts.purchased_count || 0,
    sold_count:      counts.sold_count      || 0,
    active_list_value,
    wishlist_list_value,
    total_sale_value,
    net_pnl,
    my_total_cost,
    client_total_cost,
    total_value,
  };
}

// ── Per-user Settings ─────────────────────────────────────────────────────

function getSetting(userId, key) {
  return db.prepare('SELECT value FROM settings WHERE user_id = ? AND key = ?').get(userId, key)?.value ?? null;
}

function setSetting(userId, key, value) {
  db.prepare(
    'INSERT INTO settings (user_id, key, value) VALUES (?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value'
  ).run(userId, key, value);
}

function getAllSettings(userId) {
  const rows = db.prepare('SELECT key, value FROM settings WHERE user_id = ?').all(userId);
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

// ── Wishlist watches with days waiting (for WhatsApp notifications) ─────────

function listWishlistWatchesWithDays(ownerId) {
  if (ownerId == null) {
    // Legacy aggregate path
    return db.prepare(`
      SELECT w.id, w.model, w.created_at, w.image_path, w.currency,
             p.name AS client_name, p.id AS profile_id, p.owner_id,
             CAST((julianday('now') - julianday(w.created_at)) AS INTEGER) AS days_waiting
      FROM watches w
      JOIN profiles p ON p.id = w.profile_id
      WHERE w.status = 'wishlist'
      ORDER BY days_waiting DESC
    `).all();
  }
  return db.prepare(`
    SELECT w.id, w.model, w.created_at, w.image_path, w.currency,
           p.name AS client_name, p.id AS profile_id,
           CAST((julianday('now') - julianday(w.created_at)) AS INTEGER) AS days_waiting
    FROM watches w
    JOIN profiles p ON p.id = w.profile_id
    WHERE w.status = 'wishlist' AND p.owner_id = ?
    ORDER BY days_waiting DESC
  `).all(ownerId);
}

// Find the owner_id of a given profile (used by event-notifier to fan out
// to the right WhatsApp group when a watch event fires).
function getOwnerIdForProfile(profileId) {
  return db.prepare('SELECT owner_id FROM profiles WHERE id = ?').get(profileId)?.owner_id ?? null;
}

function getOwnerIdForWatch(watchId) {
  return db.prepare(
    'SELECT p.owner_id FROM watches w JOIN profiles p ON p.id = w.profile_id WHERE w.id = ?'
  ).get(watchId)?.owner_id ?? null;
}

// ── Loss Payments ──────────────────────────────────────────────────────────

function listLossPayments(watchId) {
  return db.prepare(
    'SELECT * FROM loss_payments WHERE watch_id = ? ORDER BY date ASC, created_at ASC'
  ).all(watchId);
}

function getLossPayment(id) {
  return db.prepare('SELECT * FROM loss_payments WHERE id = ?').get(id);
}

function createLossPayment({ watch_id, date, amount, method, notes }) {
  const result = db.prepare(
    'INSERT INTO loss_payments (watch_id, date, amount, method, notes) VALUES (?, ?, ?, ?, ?)'
  ).run(watch_id, date, Number(amount), method || 'BANK_TRANSFER', notes || null);
  _syncLossStatus(watch_id);
  return result.lastInsertRowid;
}

function reversePayment(paymentId) {
  const row = db.prepare('SELECT watch_id FROM loss_payments WHERE id = ?').get(paymentId);
  if (!row) return false;
  db.prepare('UPDATE loss_payments SET reversed = 1 WHERE id = ?').run(paymentId);
  _syncLossStatus(row.watch_id);
  return true;
}

// Internal helper — recalculate loss_status based on sum of active payments
function _syncLossStatus(watchId) {
  const watch = db.prepare('SELECT list_price, sale_price FROM watches WHERE id = ?').get(watchId);
  if (!watch || watch.list_price == null || watch.sale_price == null) return;
  const lossAmount = watch.list_price - watch.sale_price;
  if (lossAmount <= 0) {
    db.prepare("UPDATE watches SET loss_status = 'not_applicable' WHERE id = ?").run(watchId);
    return;
  }
  const { total_paid } = db.prepare(
    'SELECT COALESCE(SUM(amount), 0) AS total_paid FROM loss_payments WHERE watch_id = ? AND reversed = 0'
  ).get(watchId);
  const status = total_paid <= 0         ? 'open'
               : total_paid >= lossAmount ? 'settled'
               :                            'partially_paid';
  db.prepare('UPDATE watches SET loss_status = ? WHERE id = ?').run(status, watchId);
}

module.exports = {
  init,
  getUserByUsername, getUserById, setUserPassword, listUsers,
  listShops, getShop, createShop, updateShop, deleteShop, listProfilesForShop, listIndividualProfilesForShop,
  listPortfolios, getPortfolio, createPortfolio, updatePortfolio, deletePortfolio, listProfilesForPortfolio, setPortfolioToken, getPortfolioByToken,
  listClients, getClient, getClientByMasterId, getClientWithMemberships, createClient, updateClient, deleteClient,
  listProfiles, getProfile, createProfile, updateProfile, deleteProfile,
  listWatchesForProfile, listAllWatches, getWatch, createWatch, updateWatch, deleteWatch,
  listCompanyDocs, getCompanyDoc, createCompanyDoc, deleteCompanyDoc,
  getStats,
  getSetting, setSetting, getAllSettings,
  listWishlistWatchesWithDays, getOwnerIdForProfile, getOwnerIdForWatch,
  listLossPayments, getLossPayment, createLossPayment, reversePayment,
};
