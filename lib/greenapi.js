'use strict';

/**
 * GreenAPI WhatsApp integration
 * Docs: https://green-api.com/en/docs/api/sending/SendMessage/
 *
 * GreenAPI uses per-instance API URLs (e.g. https://7107.api.greenapi.com).
 * The apiUrl setting must be stored without trailing slash.
 */

/**
 * Send a text message to a WhatsApp chat / group.
 * @param {string} apiUrl      – Instance-specific base URL (e.g. https://7107.api.greenapi.com)
 * @param {string} instanceId  – GreenAPI instance ID
 * @param {string} apiToken    – GreenAPI API token
 * @param {string} chatId      – Recipient: phone@c.us or groupid@g.us
 * @param {string} message     – Plain-text message body
 * @returns {Promise<object>}  – GreenAPI response JSON
 */
async function sendMessage(apiUrl, instanceId, apiToken, chatId, message) {
  const base = (apiUrl || 'https://api.green-api.com').replace(/\/$/, '');
  const url  = `${base}/waInstance${instanceId}/sendMessage/${apiToken}`;
  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ chatId, message }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || json.error || `GreenAPI error ${res.status}`);
  return json;
}

module.exports = { sendMessage };
