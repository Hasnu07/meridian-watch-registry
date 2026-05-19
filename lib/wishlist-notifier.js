'use strict';

const db       = require('../db');
const greenapi = require('./greenapi');

/**
 * Send wishlist-milestone WhatsApp reminders for a specific user.
 * Each user has their own GreenAPI settings and target group, so the
 * notifier is fully scoped — it never crosses tenant boundaries.
 *
 * @param {number} userId                – The user whose reminders to run
 * @param {object} [opts]                – Options
 * @param {boolean} [opts.force]         – Send even if no milestones (test mode)
 * @returns {Promise<{sent, count, message, error}>}
 */
async function checkAndNotifyForUser(userId, opts = {}) {
  const apiUrl     = db.getSetting(userId, 'greenapi_api_url');
  const instanceId = db.getSetting(userId, 'greenapi_instance_id');
  const apiToken   = db.getSetting(userId, 'greenapi_api_token');
  const groupId    = db.getSetting(userId, 'greenapi_group_id');

  if (!instanceId || !apiToken || !groupId) {
    return { sent: false, count: 0, message: null, error: 'GreenAPI not configured — set Instance ID, API Token and Group ID in Settings.' };
  }

  const watches = db.listWishlistWatchesWithDays(userId);

  const milestone = watches.filter(w => w.days_waiting > 0 && w.days_waiting % 10 === 0);

  if (!milestone.length && !opts.force) {
    return { sent: false, count: 0, message: null, error: null };
  }

  const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  let body;
  if (milestone.length) {
    const lines = milestone.map(w => {
      const urgency = w.days_waiting >= 30 ? '🔴' : w.days_waiting >= 20 ? '🟡' : '🟢';
      return `${urgency} *${w.model}*\n   Client: ${w.client_name}\n   ⏳ ${w.days_waiting} days waiting`;
    });

    body = `⌚ *Wishlist Reminder — ${dateStr}*\n\n`
         + `The following ${milestone.length === 1 ? 'watch has' : `${milestone.length} watches have`} reached a 10-day milestone:\n\n`
         + lines.join('\n\n')
         + `\n\n📌 Log in to Meridian to review.`;
  } else {
    const lines = watches.slice(0, 10).map(w => {
      const urgency = w.days_waiting >= 30 ? '🔴' : w.days_waiting >= 20 ? '🟡' : '🟢';
      return `${urgency} *${w.model}* — ${w.client_name} (${w.days_waiting}d)`;
    });
    const more = watches.length > 10 ? `\n…and ${watches.length - 10} more.` : '';
    body = `⌚ *Wishlist Test Message — ${dateStr}*\n\n`
         + `There are *${watches.length}* watches on the wishlist:\n\n`
         + lines.join('\n')
         + more
         + `\n\n✅ GreenAPI integration is working correctly.`;
  }

  try {
    await greenapi.sendMessage(apiUrl, instanceId, apiToken, groupId, body);
    return { sent: true, count: milestone.length, message: body, error: null };
  } catch (e) {
    return { sent: false, count: 0, message: body, error: e.message };
  }
}

// Back-compat shim — old callers expected a global checkAndNotify.
// Now it fans out across every user account.
async function checkAndNotify(opts = {}) {
  const users = db.listUsers();
  let totalSent = 0;
  let totalCount = 0;
  let lastError = null;
  for (const u of users) {
    const r = await checkAndNotifyForUser(u.id, opts);
    if (r.sent) { totalSent++; totalCount += r.count; }
    if (r.error) lastError = `[${u.username}] ${r.error}`;
  }
  return { sent: totalSent > 0, count: totalCount, message: null, error: lastError };
}

module.exports = { checkAndNotify, checkAndNotifyForUser };
