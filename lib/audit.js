'use strict';

const db = require('../db');

/**
 * Fire-and-forget audit log helper that pulls actor info from the Express
 * request's session. Always uses the REAL session user as `actor_id` so a
 * master impersonating another user is still attributable. A collaborator
 * acting in a shop shared with them (req.collab) has that shop and registry
 * written into the details, so the owner can see who did what in their shop.
 *
 * Usage from any authenticated route:
 *   audit(req, { action: 'create', targetType: 'watch', targetId: id, details: {...} });
 *
 * Never throws — audit failures are logged but never break the request.
 */
function audit(req, fields) {
  try {
    if (!req?.session?.user) return;
    const details = req.collab
      ? { ...(fields.details || {}), collab_shop_id: req.collab.shopId, registry_owner_id: req.collab.ownerId }
      : fields.details;
    db.logAudit({
      actorId:       req.session.user.id,
      actorUsername: req.session.user.username,
      viewingAs:     req.session.viewing_as || null,
      ...fields,
      details,
    });
  } catch (e) {
    console.warn('[audit] middleware log failed:', e.message);
  }
}

module.exports = audit;
