'use strict';

const db = require('../db');

/**
 * Fire-and-forget audit log helper that pulls actor info from the Express
 * request's session. Always uses the REAL session user as `actor_id` so a
 * master impersonating another user is still attributable.
 *
 * Usage from any authenticated route:
 *   audit(req, { action: 'create', targetType: 'watch', targetId: id, details: {...} });
 *
 * Never throws — audit failures are logged but never break the request.
 */
function audit(req, fields) {
  try {
    if (!req?.session?.user) return;
    db.logAudit({
      actorId:       req.session.user.id,
      actorUsername: req.session.user.username,
      viewingAs:     req.session.viewing_as || null,
      ...fields,
    });
  } catch (e) {
    console.warn('[audit] middleware log failed:', e.message);
  }
}

module.exports = audit;
