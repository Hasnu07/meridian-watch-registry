'use strict';

// Session store backed by Node's built-in node:sqlite (DatabaseSync) — the
// same driver db.js uses. This replaces connect-sqlite3, which pulls in the
// native `sqlite3` npm module: that native binding builds on Windows locally
// but ships a broken/incompatible binary on Render's Linux runtime
// (`this.db.exec is not a function`), crashing the server at startup.
// node:sqlite has no native-build step, so it's immune to that fragility.

const path      = require('path');
const session   = require('express-session');
const { DatabaseSync } = require('node:sqlite');
const { DATA_DIR } = require('../config');

const Store = session.Store;
const EIGHT_HOURS = 8 * 60 * 60 * 1000;

module.exports = function createSqliteSessionStore() {
  const db = new DatabaseSync(path.join(DATA_DIR, 'sessions.sqlite'));
  db.exec(`
    CREATE TABLE IF NOT EXISTS session_store (
      sid    TEXT PRIMARY KEY,
      sess   TEXT NOT NULL,
      expire INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_session_store_expire ON session_store (expire);
  `);

  const expiryOf = (sess) => {
    const exp = sess && sess.cookie && sess.cookie.expires;
    return exp ? new Date(exp).getTime() : Date.now() + EIGHT_HOURS;
  };

  class SqliteSessionStore extends Store {
    constructor() {
      super();
      this.db = db;
      this._sweep();
      // Purge expired rows hourly (unref so it never keeps the process alive)
      this._timer = setInterval(() => this._sweep(), 60 * 60 * 1000);
      if (this._timer.unref) this._timer.unref();
    }

    _sweep() {
      try { this.db.prepare('DELETE FROM session_store WHERE expire < ?').run(Date.now()); } catch {}
    }

    get(sid, cb) {
      try {
        const row = this.db.prepare('SELECT sess, expire FROM session_store WHERE sid = ?').get(sid);
        if (!row) return cb(null, null);
        if (row.expire < Date.now()) { this.destroy(sid, () => {}); return cb(null, null); }
        return cb(null, JSON.parse(row.sess));
      } catch (e) { return cb(e); }
    }

    set(sid, sess, cb) {
      try {
        this.db.prepare(
          'INSERT INTO session_store (sid, sess, expire) VALUES (?, ?, ?) ' +
          'ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expire = excluded.expire'
        ).run(sid, JSON.stringify(sess), expiryOf(sess));
        return cb && cb(null);
      } catch (e) { return cb && cb(e); }
    }

    touch(sid, sess, cb) {
      try {
        this.db.prepare('UPDATE session_store SET expire = ? WHERE sid = ?').run(expiryOf(sess), sid);
        return cb && cb(null);
      } catch (e) { return cb && cb(e); }
    }

    destroy(sid, cb) {
      try {
        this.db.prepare('DELETE FROM session_store WHERE sid = ?').run(sid);
        return cb && cb(null);
      } catch (e) { return cb && cb(e); }
    }

    clear(cb) {
      try { this.db.exec('DELETE FROM session_store'); return cb && cb(null); }
      catch (e) { return cb && cb(e); }
    }

    length(cb) {
      try {
        const { n } = this.db.prepare('SELECT COUNT(*) AS n FROM session_store').get();
        return cb(null, n);
      } catch (e) { return cb(e); }
    }
  }

  return new SqliteSessionStore();
};
