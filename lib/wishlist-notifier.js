'use strict';

const db       = require('../db');
const greenapi = require('./greenapi');

/**
 * Check wishlist watches for 10/20/30/40… day milestones.
 * If any are found, send a WhatsApp message to the configured group.
 *
 * @param {object} [opts]           – Override settings (used for manual test)
 * @param {boolean} [opts.force]    – Send even if no milestone watches (for test)
 * @returns {Promise<{sent: boolean, count: number, message: string|null, error: string|null}>}
 */
async function checkAndNotify(opts = {}) {
  const instanceId = db.getSetting('greenapi_instance_id');
  const apiToken   = db.getSetting('greenapi_api_token');
  const groupId    = db.getSetting('greenapi_group_id');

  if (!instanceId || !apiToken || !groupId) {
    return { sent: false, count: 0, message: null, error: 'GreenAPI not configured — set Instance ID, API Token and Group ID in Settings.' };
  }

  const watches = db.listWishlistWatchesWithDays();

  // Filter to milestone watches (10, 20, 30, 40 … days)
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
    // force/test mode — report all wishlist watches
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
    await greenapi.sendMessage(instanceId, apiToken, groupId, body);
    return { sent: true, count: milestone.length, message: body, error: null };
  } catch (e) {
    return { sent: false, count: 0, message: body, error: e.message };
  }
}

module.exports = { checkAndNotify };
