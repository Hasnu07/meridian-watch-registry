'use strict';

/**
 * GreenAPI WhatsApp integration
 * Docs: https://green-api.com/en/docs/api/sending/SendMessage/
 */

const BASE = 'https://api.green-api.com';

/**
 * Send a text message to a WhatsApp chat / group.
 * @param {string} instanceId  – GreenAPI instance ID
 * @param {string} apiToken    – GreenAPI API token
 * @param {string} chatId      – Recipient: phone@c.us or groupid@g.us
 * @param {string} message     – Plain-text message body
 * @returns {Promise<object>}  – GreenAPI response JSON
 */
async function sendMessage(instanceId, apiToken, chatId, message) {
  const url = `${BASE}/waInstance${instanceId}/sendMessage/${apiToken}`;
  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ chatId, message }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || `GreenAPI error ${res.status}`);
  return json;
}

module.exports = { sendMessage };
