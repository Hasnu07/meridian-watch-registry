// 22-vault-charts.js — Vault "At a glance" tiles open into detailed charts
// Click a tile: it expands into the SAME chart as its sparkline, enlarged —
// same series, same colour — with axes, hover crosshair + tooltip, keyboard
// arrows, 6/12/24-month range and best/worst/total, while the other three
// slide to a column on the right. ✕ / Esc closes.
// Part of the dashboard script: scripts/build.js concatenates src/dashboard/*.js
// in filename order into public/js/dashboard.js (one classic script, so
// functions and top-level variables stay shared exactly as before).

let _vaultData = null;                       // { watches, stats } — set by loadVaultInsights()
const _vaultChart = { key: null, months: 12 };
let _vaultChartObserver = null;

// ── Data ───────────────────────────────────────────────────────────────────
function vaultSeries(watches, n) {
  const keys = monthKeys(n);
  const sold = watches.filter(w => w.status === 'sold');
  const cur = dominantCurrency(sold.length ? sold : watches);
  const inCur = w => (w.currency || 'CHF') === cur;
  const bought = watches.filter(w => w.status === 'purchased' || w.status === 'sold');
  const created = w => (w.created_at || '').slice(0, 10);
  const running = arr => { let t = 0; return arr.map(v => (t += v)); };
  const monthDate = k => new Date(k + '-01T00:00:00');
  const pnl = monthlySeries(sold.filter(w => inCur(w) && watchPnl(w) != null), watchDate, watchPnl, n);
  return {
    cur, keys,
    short: keys.map(k => monthDate(k).toLocaleDateString('en-GB', { month: 'short' })),
    long:  keys.map(k => monthDate(k).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })),
    year:  keys.map(k => k.slice(2, 4)),
    pnl, cumPnl: running(pnl),
    soldCount:   monthlySeries(sold, watchDate, () => 1, n),
    proceeds:    monthlySeries(sold.filter(w => inCur(w) && w.sale_price != null), watchDate, w => w.sale_price, n),
    boughtCount: monthlySeries(bought, watchDate, () => 1, n),
    boughtValue: monthlySeries(bought.filter(w => inCur(w) && w.list_price != null), watchDate, w => w.list_price, n),
    wishAdds:    monthlySeries(watches.filter(w => w.status === 'wishlist'), created, () => 1, n),
  };
}

const sumOf = a => a.reduce((x, y) => x + y, 0);
const pieces = v => `${v} piece${v === 1 ? '' : 's'}`;
function extremeMonth(vals, s, pick) {      // pick: 'max' | 'min'
  let idx = -1;
  // months with no activity (0) don't count as a best/worst month
  vals.forEach((v, i) => { if (!v) return; if (idx < 0 || (pick === 'max' ? v > vals[idx] : v < vals[idx])) idx = i; });
  return idx < 0 ? null : { v: vals[idx], month: s.long[idx] };
}

// ── One metric per tile ─────────────────────────────────────────────────────
// The SAME series and colour drive the tile's sparkline and its zoomed chart,
// so the small and big chart are always the same picture at two sizes.
// Extra numbers (pieces, running total) only appear in the hover tooltip.
const VAULT_METRICS = {
  pnl: {
    key: 'pnl', label: 'Realised P&L', money: true, signed: true,
    color: vals => (sumOf(vals) >= 0 ? SPARK.green : SPARK.red),     // green in profit, red at a loss
    caption: s => `realised P&L / month · ${s.cur}`,
    title: 'Realised P&L by month',
    extras: [['Pieces sold', 'soldCount', 'count'], ['Running total', 'cumPnl', 'signed']],
  },
  sales: {
    key: 'proceeds', label: 'Sales value', money: true,
    color: () => SPARK.pink,
    caption: s => `sales value / month · ${s.cur}`,
    title: 'Sales value by month',
    extras: [['Pieces sold', 'soldCount', 'count']],
  },
  inventory: {
    key: 'boughtValue', label: 'Value bought', money: true,
    color: () => SPARK.violet,
    caption: s => `value bought / month · ${s.cur}`,
    title: 'Value bought by month (list price)',
    extras: [['Pieces bought', 'boughtCount', 'count']],
  },
  wishlist: {
    key: 'wishAdds', label: 'Added to wishlist', money: false,
    color: () => SPARK.amber,
    caption: () => 'added to wishlist / month',
    title: 'Added to the wishlist by month',
    extras: [],
  },
};

// Sparkline for a tile (12 months) — same series + colour as its zoomed chart
function vaultSpark(key, s) {
  const M = VAULT_METRICS[key];
  const vals = s[M.key];
  return sparkBlock(vals, { color: M.color(vals), caption: M.caption(s), label: `${M.label} per month, last 12 months` });
}

const VAULT_SUMMARIES = {
  pnl: (s, m) => {
    const best = extremeMonth(s.pnl, s, 'max'), worst = extremeMonth(s.pnl, s, 'min'), total = sumOf(s.pnl);
    return [
      ['Total in period', m.signed(total), `${sumOf(s.soldCount)} sold`, total > 0 ? 'gain' : total < 0 ? 'loss' : ''],
      ['Best month',  best && best.v > 0 ? m.signed(best.v) : '—', best && best.v > 0 ? best.month : 'no profitable month', best && best.v > 0 ? 'gain' : ''],
      ['Worst month', worst && worst.v < 0 ? m.signed(worst.v) : '—', worst && worst.v < 0 ? worst.month : 'no losing month', worst && worst.v < 0 ? 'loss' : ''],
      ['Average / month', m.signed(total / s.keys.length), `${s.keys.length} months`, ''],
    ];
  },
  sales: (s, m) => {
    const best = extremeMonth(s.proceeds, s, 'max');
    return [
      ['Sales value', m.money(sumOf(s.proceeds)), 'in period', ''],
      ['Pieces sold', pieces(sumOf(s.soldCount)), 'in period', ''],
      ['Best month', best ? m.money(best.v) : '—', best?.month || 'no sales', ''],
      ['Average / month', m.money(sumOf(s.proceeds) / s.keys.length), `${s.keys.length} months`, ''],
    ];
  },
  inventory: (s, m) => {
    const busiest = extremeMonth(s.boughtValue, s, 'max');
    return [
      ['Value bought', m.money(sumOf(s.boughtValue)), 'list price, in period', ''],
      ['Pieces bought', pieces(sumOf(s.boughtCount)), 'in period', ''],
      ['Biggest month', busiest ? m.money(busiest.v) : '—', busiest?.month || 'no buying', ''],
      ['Still in stock', pieces(_vaultData.stats.purchased_count), 'bought, not sold', ''],
    ];
  },
  wishlist: (s) => {
    const busiest = extremeMonth(s.wishAdds, s, 'max');
    return [
      ['Added in period', pieces(sumOf(s.wishAdds)), `${s.keys.length} months`, ''],
      ['Busiest month', busiest ? pieces(busiest.v) : '—', busiest?.month || 'nothing added', ''],
      ['On wishlist now', pieces(_vaultData.stats.wishlist_count), '', ''],
      ['Waiting 30+ days', pieces(_vaultData.watches.filter(QUICK_FILTERS[0].test).length), 'needs a look', ''],
    ];
  },
};
const VAULT_NOTES = {
  pnl:       s => `Sold watches priced in ${s.cur} · sale price − list price · by each watch's date`,
  sales:     s => `Sale prices of watches sold in ${s.cur} · by each watch's date`,
  inventory: s => `Watches bought (purchased or since sold) · list price in ${s.cur} · by each watch's date`,
  wishlist:  () => 'Watches currently on the wishlist, by the month they were added',
};

// ── Formatting helpers ─────────────────────────────────────────────────────
function chartFormatters(cur) {
  const sym = { CHF: 'CHF ', EUR: '€', GBP: '£', USD: '$' }[cur] ?? `${cur} `;
  const compactFmt = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
  return {
    money:  v => fmt.price(Math.round(v), cur),
    signed: v => (Math.round(v) > 0 ? '+' : '') + fmt.price(Math.round(v), cur),
    count:  v => pieces(v),
    axisMoney: v => (v < 0 ? '−' : '') + sym + compactFmt.format(Math.abs(v)),
    axisCount: v => compactFmt.format(v),
  };
}
function niceTicks(min, max, count, integer) {
  if (min === max) max = min + 1;
  const rawStep = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(rawStep));
  const norm = rawStep / mag;
  let step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  if (integer) step = Math.max(1, Math.ceil(step));
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toFixed(8));
  return { lo, hi: hi === lo ? lo + step : hi, ticks };
}

// ── Chart drawing: the tile's sparkline, enlarged, with axes + hover ───────
function drawVaultChart(host, key, months, animate) {
  const M = VAULT_METRICS[key];
  const s = vaultSeries(_vaultData.watches, months);
  const f = chartFormatters(s.cur);
  const vals = s[M.key];
  const color = M.color(vals);
  const W = Math.max(300, Math.floor(host.clientWidth)), H = 300;
  const m = { l: 62, r: 16, t: 16, b: 34 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b, n = s.keys.length, step = n > 1 ? iw / (n - 1) : iw;

  const tk = niceTicks(Math.min(0, ...vals), Math.max(0, ...vals), 4, !M.money);
  const y = v => m.t + (1 - (v - tk.lo) / (tk.hi - tk.lo)) * ih;
  const x = i => m.l + (n > 1 ? step * i : iw / 2);       // points span edge to edge, like the sparkline
  const fmtAxis = M.money ? f.axisMoney : f.axisCount;
  const fmtVal = M.money ? (M.signed ? f.signed : f.money) : f.count;
  const zeroY = y(0);
  const id = 'vc' + Math.random().toString(36).slice(2, 8);

  let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" tabindex="0"
      aria-label="${esc(M.title)} chart. Use left and right arrow keys to read each month.">
    <defs><linearGradient id="${id}a" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.35"/><stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs>`;
  for (const v of tk.ticks) {
    const yy = y(v).toFixed(1);
    svg += `<line class="vc-grid" x1="${m.l}" x2="${W - m.r}" y1="${yy}" y2="${yy}"/>
      <text class="vc-axis" x="${m.l - 10}" y="${yy}" text-anchor="end" dominant-baseline="middle">${esc(fmtAxis(v))}</text>`;
  }
  if (tk.lo < 0) svg += `<line class="vc-zero" x1="${m.l}" x2="${W - m.r}" y1="${zeroY.toFixed(1)}" y2="${zeroY.toFixed(1)}"/>`;
  const every = n > 12 ? 2 : 1;
  s.short.forEach((lab, i) => {
    if (i % every && i !== n - 1) return;
    const showYear = i === 0 || s.keys[i].endsWith('-01');
    const anchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
    svg += `<text class="vc-axis vc-x" x="${x(i).toFixed(1)}" y="${H - m.b + 18}" text-anchor="${anchor}">${esc(lab)}${showYear ? ` ’${s.year[i]}` : ''}</text>`;
  });
  svg += `<line class="vc-cross" x1="0" x2="0" y1="${m.t}" y2="${m.t + ih}"/>`;

  // Same construction as the sparkline: area down to the zero line + glowing line
  const pts = vals.map((v, i) => [x(i), y(v)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  svg += `<path class="vc-area" d="${d} L${pts[n - 1][0].toFixed(1)},${zeroY.toFixed(1)} L${pts[0][0].toFixed(1)},${zeroY.toFixed(1)} Z" fill="url(#${id}a)"/>
    <path class="vc-line" d="${d}" pathLength="1" stroke="${color}" style="color:${color}"/>`;
  pts.forEach((p, i) => {
    const last = i === n - 1;
    svg += `<circle class="vc-pt${last ? ' is-last' : ''}" data-i="${i}" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${last ? 4 : 3}"
      fill="${last ? color : '#0A0E14'}" stroke="${color}" stroke-width="2" style="--d:${i * 35}ms"/>`;
  });
  svg += `<rect class="vc-hit" x="${m.l - step / 2}" y="${m.t}" width="${iw + step}" height="${ih}" fill="transparent"/></svg>`;

  host.classList.toggle('no-anim', !animate);
  host.innerHTML = svg + `<div class="vd-tip" role="status" aria-live="polite"></div>`;

  // ── Interaction: crosshair + tooltip (pointer and keyboard) ──
  const el = host.querySelector('svg'), tip = host.querySelector('.vd-tip'), cross = host.querySelector('.vc-cross');
  let active = -1;
  const setActive = i => {
    if (i === active) return;
    active = i;
    host.classList.toggle('is-hovering', i >= 0);
    host.querySelectorAll('.vc-pt').forEach(c => c.classList.toggle('is-on', Number(c.dataset.i) === i));
    if (i < 0) return;
    const cxp = x(i);
    cross.setAttribute('x1', cxp); cross.setAttribute('x2', cxp);
    const v = vals[i];
    const tone = M.signed ? (v > 0 ? 'text-emerald-400' : v < 0 ? 'text-error' : '') : '';
    const rows = [`<div class="vd-tip-row"><span class="vd-key vd-key-line" style="background:${color}"></span>${esc(M.label)}<b class="${tone}">${esc(fmtVal(v))}</b></div>`];
    for (const [label, sk, kind] of M.extras) {
      const ev = s[sk][i];
      const etone = kind === 'signed' ? (ev > 0 ? 'text-emerald-400' : ev < 0 ? 'text-error' : '') : '';
      rows.push(`<div class="vd-tip-row vd-tip-extra">${esc(label)}<b class="${etone}">${esc(f[kind](ev))}</b></div>`);
    }
    tip.innerHTML = `<p class="vd-tip-title">${esc(s.long[i])}</p>${rows.join('')}`;
    const tw = tip.offsetWidth || 180;
    let left = cxp + 14;
    if (left + tw > W - 4) left = cxp - tw - 14;
    tip.style.left = Math.max(4, left) + 'px';
  };
  el.addEventListener('pointermove', e => {
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) * (W / r.width);
    setActive(Math.max(0, Math.min(n - 1, Math.round((px - m.l) / step))));
  });
  el.addEventListener('pointerleave', () => setActive(-1));
  el.addEventListener('blur', () => setActive(-1));
  el.addEventListener('keydown', e => {
    const k = e.key;
    if (k === 'ArrowRight' || k === 'ArrowLeft' || k === 'Home' || k === 'End') {
      e.preventDefault();
      const start = active < 0 ? (k === 'ArrowLeft' ? n - 1 : 0) : active;
      setActive(k === 'Home' ? 0 : k === 'End' ? n - 1 : Math.max(0, Math.min(n - 1, start + (k === 'ArrowRight' ? 1 : k === 'ArrowLeft' ? -1 : 0))));
    }
  });
  return s;
}

// ── Detail panel inside the active tile ────────────────────────────────────
function renderVaultDetail(tile, key, animate = true) {
  const M = VAULT_METRICS[key];
  const detail = tile.querySelector('.vault-detail');
  detail.innerHTML = `
    <div class="flex items-center justify-between gap-3 flex-wrap mb-3">
      <div>
        <p class="text-sm font-semibold text-on-surface">${esc(M.title)}</p>
        <div class="vd-legend" data-legend></div>
      </div>
      <div class="flex items-center gap-1.5" role="group" aria-label="Time range">
        ${[6, 12, 24].map(r => `<button type="button" class="qf-chip${_vaultChart.months === r ? ' is-on' : ''}" data-range="${r}" aria-pressed="${_vaultChart.months === r}">${r}M</button>`).join('')}
      </div>
    </div>
    <div class="vd-chart" data-chart></div>
    <div class="vd-summary"></div>
    <p class="vd-note"></p>`;
  const host = detail.querySelector('[data-chart]');
  const s = drawVaultChart(host, key, _vaultChart.months, animate);
  const color = M.color(s[M.key]);
  detail.querySelector('[data-legend]').innerHTML =
    `<span><i class="vd-key vd-key-line" style="background:${color}"></i>${esc(M.label)} / month${M.money ? ` · ${esc(s.cur)}` : ''}</span>`;
  const m = chartFormatters(s.cur);
  detail.querySelector('.vd-summary').innerHTML = VAULT_SUMMARIES[key](s, m).map(([label, value, sub, tone]) => `
    <div class="vd-stat${tone ? ' is-' + tone : ''}">
      <p class="vd-stat-label">${esc(label)}</p>
      <p class="vd-stat-value">${esc(value)}</p>
      ${sub ? `<p class="vd-stat-sub">${esc(sub)}</p>` : ''}
    </div>`).join('');
  detail.querySelector('.vd-note').textContent = VAULT_NOTES[key](s);

  // Redraw (without replaying the animation) when the panel width changes
  _vaultChartObserver?.disconnect();
  let lastW = host.clientWidth;
  _vaultChartObserver = new ResizeObserver(() => {
    if (Math.abs(host.clientWidth - lastW) < 4) return;
    lastW = host.clientWidth;
    drawVaultChart(host, key, _vaultChart.months, false);
  });
  _vaultChartObserver.observe(host);
}

// ── Open / switch / close (View Transitions animate the layout change) ──────
function applyVaultChartState(animate = true) {
  const grid = document.getElementById('vaultTiles');
  if (!grid) return;
  const key = _vaultChart.key;
  grid.classList.toggle('is-expanded', !!key);
  grid.querySelectorAll('.vault-tile').forEach(t => {
    const on = t.dataset.tile === key;
    t.classList.toggle('is-active', on);
    t.setAttribute('aria-expanded', String(on));
    t.setAttribute('role', on ? 'region' : 'button');
    t.tabIndex = on ? -1 : 0;
    if (!on) t.querySelector('.vault-detail').innerHTML = '';
  });
  if (!key) { _vaultChartObserver?.disconnect(); return; }
  const tile = grid.querySelector(`.vault-tile[data-tile="${key}"]`);
  if (tile) renderVaultDetail(tile, key, animate);
}
function vaultTransition(mutate) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (document.startViewTransition && !reduce) return document.startViewTransition(mutate);
  mutate();
  return null;
}
function openVaultChart(key) {
  if (!_vaultData || !VAULT_METRICS[key] || _vaultChart.key === key) return;
  vaultTransition(() => { _vaultChart.key = key; applyVaultChartState(true); });
}
function closeVaultChart() {
  if (!_vaultChart.key) return;
  const was = _vaultChart.key;
  const t = vaultTransition(() => { _vaultChart.key = null; applyVaultChartState(false); });
  const refocus = () => document.querySelector(`.vault-tile[data-tile="${was}"]`)?.focus({ preventScroll: true });
  t ? t.finished.then(refocus) : refocus();
}
function restoreVaultChart() {
  if (_vaultChart.key) applyVaultChartState(false);
}

document.getElementById('vaultTiles').addEventListener('click', e => {
  if (e.target.closest('[data-close-chart]')) { e.stopPropagation(); closeVaultChart(); return; }
  const range = e.target.closest('[data-range]');
  if (range) {
    _vaultChart.months = Number(range.dataset.range);
    const tile = range.closest('.vault-tile');
    renderVaultDetail(tile, tile.dataset.tile, true);
    tile.querySelector(`[data-range="${_vaultChart.months}"]`)?.focus();
    return;
  }
  const tile = e.target.closest('.vault-tile');
  if (tile && !tile.classList.contains('is-active')) openVaultChart(tile.dataset.tile);
});
document.getElementById('vaultTiles').addEventListener('keydown', e => {
  const tile = e.target.closest('.vault-tile');
  if (tile && e.target === tile && !tile.classList.contains('is-active') && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    openVaultChart(tile.dataset.tile);
  }
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || !_vaultChart.key || currentPage !== 'dashboard' || anyModalOpen()) return;
  closeVaultChart();
});
