'use strict';

/**
 * Which user's workspace a request reads and writes.
 *
 *  - master / admin: their own id, or the user they are "viewing as".
 *  - boutique_manager: their own id too — they have a workspace of their own
 *    (shops, clients, watches). The shop they manage in their owner's registry
 *    is read-only and is answered by routes/boutique.js, which never calls
 *    uid(): it uses the owner_id / shop_id on the account.
 *  - a collaborator working a shop shared with them (the X-Collab-Shop header,
 *    checked by routes/collab.js, which sets req.collab): the registry that
 *    shop belongs to, for that one request.
 */
function uid(req) {
  const u = req.session?.user;
  if (!u) return null;
  if (req.collab) return req.collab.ownerId;
  return req.session.viewing_as || u.id;
}

module.exports = uid;
