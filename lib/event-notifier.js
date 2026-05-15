'use strict';

const db       = require('../db');
const greenapi = require('./greenapi');

// ── Helpers ───────────────────────────────────────────────────────────────

function today() {
  return new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtMoney(amount, currency) {
  if (amount == null) return '—';
  return (currency || 'CHF') + ' ' + Number(amount).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function statusLabel(s) {
  return s === 'wishlist' ? '📋 Wishlist' : s === 'purchased' ? '📦 Purchased' : s === 'sold' ? '✅ Sold' : s;
}

// ── Core send (fire-and-forget) ───────────────────────────────────────────

async function send(message) {
  try {
    const apiUrl     = db.getSetting('greenapi_api_url');
    const instanceId = db.getSetting('greenapi_instance_id');
    const apiToken   = db.getSetting('greenapi_api_token');
    const groupId    = db.getSetting('greenapi_group_id');
    if (!instanceId || !apiToken || !groupId) return; // not configured
    await greenapi.sendMessage(apiUrl, instanceId, apiToken, groupId, message);
  } catch (e) {
    console.warn('[WhatsApp] Event notify failed:', e.message);
  }
}

// ── Event formatters ──────────────────────────────────────────────────────

// ─ Profile / membership events ─

function onProfileCreated(profile) {
  const shop = profile.shop_name || '—';
  send(
    `👤 *New Client Added*\n\n` +
    `Name: ${profile.name}\n` +
    `Shop: ${shop}\n` +
    `Email: ${profile.email}\n` +
    `📅 ${today()}`
  );
}

function onProfileDeleted(profile) {
  const shop = profile.shop_name || '—';
  send(
    `🗑️ *Client Removed*\n\n` +
    `Name: ${profile.name}\n` +
    `Shop: ${shop}\n` +
    `📅 ${today()}`
  );
}

// ─ Watch events ─

function onWatchCreated(watch, profile) {
  const status = watch.status || 'wishlist';
  const icon   = status === 'purchased' ? '📦' : status === 'sold' ? '✅' : '📋';
  const lines  = [
    `${icon} *Watch Added — ${statusLabel(status)}*\n`,
    `Model: ${watch.model}`,
    `Client: ${profile.name}`,
    `Source: ${watch.source}`,
  ];
  if (watch.list_price)  lines.push(`List Price: ${fmtMoney(watch.list_price, watch.currency)}`);
  if (watch.price)       lines.push(`Price: ${fmtMoney(watch.price, watch.currency)}`);
  if (watch.sale_price && status === 'sold') lines.push(`Sale Price: ${fmtMoney(watch.sale_price, watch.currency)}`);
  lines.push(`📅 ${today()}`);
  send(lines.join('\n'));
}

function onWatchStatusChanged(oldWatch, newStatus, updates, profile) {
  // Only send for meaningful status transitions
  if (oldWatch.status === newStatus) return;

  if (newStatus === 'sold') {
    const salePrice = updates.sale_price ?? oldWatch.sale_price;
    const soldTo    = updates.sold_to    ?? oldWatch.sold_to;
    const listPrice = oldWatch.list_price;
    const gross     = salePrice != null && listPrice != null ? salePrice - listPrice : null;
    const lines = [
      `💰 *Watch Sold!*\n`,
      `Model: ${oldWatch.model}`,
      `Client: ${profile?.name || '—'}`,
      `Source: ${oldWatch.source}`,
    ];
    if (listPrice)  lines.push(`List Price: ${fmtMoney(listPrice, oldWatch.currency)}`);
    if (salePrice != null) lines.push(`Sale Price: ${fmtMoney(salePrice, oldWatch.currency)}`);
    if (gross != null) lines.push(`Gross P&L: ${gross >= 0 ? '+' : ''}${fmtMoney(gross, oldWatch.currency)}`);
    if (soldTo)     lines.push(`Sold To: ${soldTo}`);
    lines.push(`📅 ${today()}`);
    send(lines.join('\n'));
    return;
  }

  if (newStatus === 'purchased') {
    const price = updates.price ?? oldWatch.price;
    const lines = [
      `📦 *Watch Purchased*\n`,
      `Model: ${oldWatch.model}`,
      `Client: ${profile?.name || '—'}`,
      `Source: ${oldWatch.source}`,
    ];
    if (oldWatch.list_price) lines.push(`List Price: ${fmtMoney(oldWatch.list_price, oldWatch.currency)}`);
    if (price != null)       lines.push(`Price Paid: ${fmtMoney(price, oldWatch.currency)}`);
    lines.push(`📅 ${today()}`);
    send(lines.join('\n'));
    return;
  }

  if (newStatus === 'wishlist') {
    send(
      `📋 *Watch Moved to Wishlist*\n\n` +
      `Model: ${oldWatch.model}\n` +
      `Client: ${profile?.name || '—'}\n` +
      `📅 ${today()}`
    );
  }
}

function onWatchDeleted(watch, profile) {
  send(
    `🗑️ *Watch Removed*\n\n` +
    `Model: ${watch.model}\n` +
    `Client: ${profile?.name || '—'}\n` +
    `Status was: ${statusLabel(watch.status)}\n` +
    `📅 ${today()}`
  );
}

module.exports = {
  onProfileCreated,
  onProfileDeleted,
  onWatchCreated,
  onWatchStatusChanged,
  onWatchDeleted,
};
