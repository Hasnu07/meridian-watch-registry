'use strict';
// ONE-TIME DATA RESTORE ENDPOINT — remove this file after use
const express = require('express');
const { DatabaseSync } = require('node:sqlite');
const { DB_PATH } = require('../config');

const router = express.Router();
const SECRET = 'meridian-restore-2026';

router.get('/', (req, res) => {
  if (req.query.token !== SECRET) return res.status(403).json({ error: 'Forbidden' });

  try {
    const db = new DatabaseSync(DB_PATH);

    // Get UNIÖN SUIZA shop id
    const shop = db.prepare("SELECT id FROM shops WHERE name = 'UNIÖN SUIZA'").get();
    if (!shop) return res.status(500).json({ error: 'UNIÖN SUIZA shop not found — run /api/shops first' });
    const shopId = shop.id;

    // Clear existing profiles (cascades to watches, company_docs)
    db.exec("DELETE FROM profiles");

    // Insert profiles
    const insProfile = db.prepare(`
      INSERT INTO profiles
        (name, email, address, subscriber_id, pp_urn, photo_path, id_card_path,
         title, first_name, last_name, gender, dob, postal_code, city, country, shop_id, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);

    const PROFILES = [
      { old_id: 2, name: 'Rodriguez Martine Jesus', email: 'rodriguezmartinejesus23@gmail.com',
        address: 'AVDA. DE NOVELDA 37', subscriber_id: '659383/SPA', pp_urn: '249496',
        photo_path: null, id_card_path: null,
        title: 'Mr.', first_name: 'Jesús', last_name: 'Rodríguez Martínez',
        gender: 'M', dob: 'April 14, 1985', postal_code: '03205', city: 'Elche', country: 'Spain',
        created_at: '2026-05-12 11:34:24' },
      { old_id: 5, name: 'Irenene Rodriguez Martinez', email: 'irenenerodriguez4995@gmail.com',
        address: 'AVDA. DE NOVELDA', subscriber_id: null, pp_urn: '251577',
        photo_path: null, id_card_path: null,
        title: 'Mrs.', first_name: 'Irene', last_name: 'Rodriguez Martinez',
        gender: 'F', dob: null, postal_code: '03205', city: 'Elche', country: 'Spain',
        created_at: '2026-05-12 12:04:32' },
      { old_id: 6, name: 'Ummay Rabab Abbas', email: 'ummayrabababbas@gmail.com',
        address: 'Creek harbour Dubai', subscriber_id: null, pp_urn: null,
        photo_path: null, id_card_path: null,
        title: 'Ms.', first_name: null, last_name: null,
        gender: null, dob: null, postal_code: null, city: null, country: null,
        created_at: '2026-05-12 12:07:28' },
    ];

    const idMap = {};
    for (const p of PROFILES) {
      const r = insProfile.run(
        p.name, p.email, p.address, p.subscriber_id, p.pp_urn,
        p.photo_path, p.id_card_path,
        p.title, p.first_name, p.last_name,
        p.gender, p.dob, p.postal_code, p.city, p.country,
        shopId, p.created_at
      );
      idMap[p.old_id] = Number(r.lastInsertRowid);
    }

    // Insert watches
    const insWatch = db.prepare(`
      INSERT INTO watches
        (profile_id, model, serial_number, source, purchase_date, price,
         reference_number, notes, image_path, movement_number, case_number, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `);

    const WATCHES = [
      { old_profile: 2, model: 'Nautilus 7118/1200R-001',             serial_number: '7839152/6846200',  source: 'Company', purchase_date: null, price: null, reference_number: null, notes: 'Subscriber ID: 659383/SPA\nPP URN: 249496',                        image_path: null, movement_number: null, case_number: null, created_at: '2026-05-12 11:36:21' },
      { old_profile: 2, model: 'Calatrava 4997/200R-001',             serial_number: '7764081/6788023',  source: 'Company', purchase_date: null, price: null, reference_number: null, notes: 'Subscriber ID: 659383/SPA\nPP URN: 249496 | Patek Identification', image_path: null, movement_number: null, case_number: null, created_at: '2026-05-12 11:37:23' },
      { old_profile: 5, model: 'Patek Philippe Twenty~4 7300/1200A-011', serial_number: '730O/1200A-011', source: 'Company', purchase_date: null, price: null, reference_number: '7300/1200A-011', notes: null, image_path: null, movement_number: null, case_number: null, created_at: '2026-05-12 12:06:04' },
    ];

    for (const w of WATCHES) {
      insWatch.run(
        idMap[w.old_profile], w.model, w.serial_number, w.source,
        w.purchase_date, w.price, w.reference_number, w.notes,
        w.image_path, w.movement_number, w.case_number, w.created_at
      );
    }

    db.close();
    res.json({ ok: true, profiles_inserted: PROFILES.length, watches_inserted: WATCHES.length, id_map: idMap });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
