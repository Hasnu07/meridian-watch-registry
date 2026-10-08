// 17-insights.js — date helpers, monthly series and sparkline charts
// Part of the dashboard script: scripts/build.js concatenates src/dashboard/*.js
// in filename order into public/js/dashboard.js (one classic script, so
// functions and top-level variables stay shared exactly as before).

// ── Watch dates ────────────────────────────────────────────────────────────
// There is no separate stored sale date: the Mark Sold flow writes the deal
// date into market_price_date / purchase_date. So a watch's "date" is the
// same one its card shows: market-price date → purchase date → created.
function watchDate(w) {
  return w.market_price_date || w.purchase_date || (w.created_at || '').slice(0, 10) || null;
}
function daysSince(isoDate) {
  if (!isoDate) return null;
  const t = new Date(String(isoDate).replace(' ', 'T')).getTime();
  return Number.isFinite(t) ? Math.max(0, Math.floor((Date.now() - t) / 86400000)) : null;
}
// Wishlist age counts from when the watch was added to the wishlist
function wishlistDays(w) { return daysSince(w.created_at); }
// Realised P&L of a sold watch in its own currency (null when not computable)
function watchPnl(w) {
  return w.status === 'sold' && w.sale_price != null && w.list_price != null ? w.sale_price - w.list_price : null;
}
function isThisMonth(isoDate) {
  if (!isoDate) return false;
  const d = new Date(isoDate + 'T00:00:00'), now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

// ── Monthly series (oldest → newest, current month last) ──────────────────
function monthKeys(n = 12) {
  const keys = [], now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}
// items → [{date:'YYYY-MM-DD', value:number}] summed per month
function monthlySeries(items, dateFn, valueFn = () => 1, n = 12) {
  const keys = monthKeys(n);
  const idx = Object.fromEntries(keys.map((k, i) => [k, i]));
  const out = new Array(n).fill(0);
  for (const it of items) {
    const d = dateFn(it);
    const i = d ? idx[String(d).slice(0, 7)] : undefined;
    if (i !== undefined) out[i] += Number(valueFn(it)) || 0;
  }
  return out;
}
// Currency with the most sold watches (money trends must not mix currencies)
function dominantCurrency(watches) {
  const n = {};
  for (const w of watches) { const c = w.currency || 'CHF'; n[c] = (n[c] || 0) + 1; }
  return Object.entries(n).sort((a, b) => b[1] - a[1])[0]?.[0] || 'CHF';
}

// ── Sparkline ──────────────────────────────────────────────────────────────
// Tiny trend line like the ones next to stock prices. Colour is a CSS colour.
let _sparkSeq = 0;
function sparklineSvg(values, { color = '#22D3FF', height = 34, label = '' } = {}) {
  const vals = (values || []).map(v => Number(v) || 0);
  if (vals.length < 2 || vals.every(v => v === 0)) {
    return `<div class="spark-empty" style="height:${height}px">no activity in the last 12 months</div>`;
  }
  const W = 120, H = height, pad = 3;
  const min = Math.min(0, ...vals), max = Math.max(0, ...vals);
  const span = max - min || 1;
  const x = i => (i / (vals.length - 1)) * W;
  const y = v => pad + (1 - (v - min) / span) * (H - pad * 2);
  const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const id = `spk${++_sparkSeq}`;
  const zeroY = y(0).toFixed(1);
  const last = vals.length - 1;
  return `<svg class="sparkline" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(label || '12-month trend')}" style="height:${H}px">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.35"/><stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs>
    ${min < 0 ? `<line x1="0" x2="${W}" y1="${zeroY}" y2="${zeroY}" stroke="rgba(255,255,255,0.12)" stroke-dasharray="2 3" vector-effect="non-scaling-stroke"/>` : ''}
    <polygon points="0,${zeroY} ${pts.join(' ')} ${W},${zeroY}" fill="url(#${id})"/>
    <polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="1.75" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" style="filter:drop-shadow(0 0 3px ${color})"/>
    <circle cx="${x(last).toFixed(1)}" cy="${y(vals[last]).toFixed(1)}" r="2.4" fill="${color}"/>
  </svg>`;
}
// Sparkline with a one-line caption ("12 mo · GBP")
function sparkBlock(values, opts = {}) {
  return `<div class="mt-3">${sparklineSvg(values, opts)}<p class="spark-caption">${esc(opts.caption || 'last 12 months')}</p></div>`;
}

const SPARK = { cyan: '#22D3FF', violet: '#B18CFF', green: '#2CFFA8', red: '#FF4D6D', amber: '#FFC233', pink: '#FF3DCB' };

// Trend lines for a set of watches (used by the Watches tiles and the Vault)
function watchTrendSeries(watches) {
  const sold = watches.filter(w => w.status === 'sold');
  const cur = dominantCurrency(sold.length ? sold : watches);
  const soldCur = sold.filter(w => (w.currency || 'CHF') === cur);
  return {
    currency:  cur,
    pnl:       monthlySeries(soldCur.filter(w => watchPnl(w) != null), watchDate, watchPnl),
    proceeds:  monthlySeries(soldCur.filter(w => w.sale_price != null), watchDate, w => w.sale_price),
    soldCount: monthlySeries(sold, watchDate),
    bought:    monthlySeries(watches.filter(w => w.status === 'purchased' || w.status === 'sold'), watchDate),
    wishAdds:  monthlySeries(watches.filter(w => w.status === 'wishlist'), w => (w.created_at || '').slice(0, 10)),
  };
}
