'use strict';

/**
 * Which user's workspace a request reads and writes.
 *
 *  - master / admin: their own id, or the user they are "viewing as".
 *  - boutique_manager: the OWNER they were created under. A boutique manager
 *    has no workspace of their own — they look into one shop of their owner's
 *    registry (read-only; see routes/boutique.js for what they may see).
 */
function uid(req) {
  const u = req.session?.user;
  if (!u) return null;
  if (u.role === 'boutique_manager') return u.owner_id || null;
  return req.session.viewing_as || u.id;
}

module.exports = uid;
