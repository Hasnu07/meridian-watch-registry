// 22-vault-charts.js — Vault "At a glance" tiles open into detailed charts
// Click a tile: it expands into an interactive chart (hover crosshair +
// tooltip, keyboard arrows, 6/12/24-month range, best/worst/total) while the
// other three slide to a column on the right. ✕ / Esc closes.
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

// ── Chart definitions (one per tile) ────────────────────────────────────────
const VAULT_CHARTS = {
  pnl: {
    title: 'Realised P&L by month',
    bars: { key: 'pnl', label: 'P&L', signed: true, money: true },
    line: { key: 'cumPnl', label: 'Running total', color: SPARK.cyan, money: true },
    axis: 'shared',
    note: s => `Sold watches priced in ${s.cur} · sale price − list price · by each watch's date`,
    summary: (s, m) => {
      const best = extremeMonth(s.pnl, s, 'max'), worst = extremeMonth(s.pnl, s, 'min');
      return [
        ['Total in period', m.signed(sumOf(s.pnl)), `${sumOf(s.soldCount)} sold`, sumOf(s.pnl) >= 0 ? 'gain' : 'loss'],
        ['Best month',  best && best.v > 0 ? m.signed(best.v) : '—', best && best.v > 0 ? best.month : 'no profitable month', best && best.v > 0 ? 'gain' : ''],
        ['Worst month', worst && worst.v < 0 ? m.signed(worst.v) : '—', worst && worst.v < 0 ? worst.month : 'no losing month', worst && worst.v < 0 ? 'loss' : ''],
        ['Average / month', m.signed(sumOf(s.pnl) / s.keys.length), `${s.keys.length} months`, ''],
      ];
    },
  },
  sales: {
    title: 'Sales by month',
    bars: { key: 'soldCount', label: 'Pieces sold', color: SPARK.pink },
    line: { key: 'proceeds', label: 'Sales value', color: '#FF8FE3', money: true },
    axis: 'line',
    note: s => `Sales value in ${s.cur} · pieces sold in every currency · by each watch's date`,
    summary: (s, m) => {
      const best = extremeMonth(s.proceeds, s, 'max');
      return [
        ['Sales value', m.money(sumOf(s.proceeds)), 'in period', ''],
        ['Pieces sold', pieces(sumOf(s.soldCount)), 'in period', ''],
        ['Best month', best && best.v ? m.money(best.v) : '—', best?.month || '', ''],
        ['Average / month', m.money(sumOf(s.proceeds) / s.keys.length), `${s.keys.length} months`, ''],
      ];
    },
  },
  inventory: {
    title: 'Buying by month',
    bars: { key: 'boughtCount', label: 'Pieces bought', color: SPARK.violet },
    line: { key: 'boughtValue', label: 'Bought (list value)', color: '#D2BEFF', money: true },
    axis: 'line',
    note: s => `Purchased and sold pieces by each watch's date · value at list price in ${s.cur}`,
    summary: (s, m) => {
      const busiest = extremeMonth(s.boughtCount, s, 'max');
      return [
        ['Pieces bought', pieces(sumOf(s.boughtCount)), 'in period', ''],
        ['List value bought', m.money(sumOf(s.boughtValue)), 'in period', ''],
        ['Busiest month', busiest && busiest.v ? pieces(busiest.v) : '—', busiest?.month || '', ''],
        ['Still in stock', pieces(_vaultData.stats.purchased_count), 'bought, not sold', ''],
      ];
    },
  },
  wishlist: {
    title: 'Added to the wishlist by month',
    bars: { key: 'wishAdds', label: 'Added', color: SPARK.amber },
    axis: 'bars',
    note: () => 'Watches currently on the wishlist, by the month they were added',
    summary: (s) => {
      const busiest = extremeMonth(s.wishAdds, s, 'max');
      return [
        ['Added in period', pieces(sumOf(s.wishAdds)), `${s.keys.length} months`, ''],
        ['Busiest month', busiest && busiest.v ? pieces(busiest.v) : '—', busiest?.month || '', ''],
        ['On wishlist now', pieces(_vaultData.stats.wishlist_count), '', ''],
        ['Waiting 30+ days', pieces(_vaultData.watches.filter(QUICK_FILTERS[0].test).length), 'needs a look', ''],
      ];
    },
  },
};

// ── Formatting helpers ─────────────────────────────────────────────────────
function chartFormatters(cur) {
  const sym = { CHF: 'CHF ', EUR: '€', GBP: '£', USD: '$' }[cur] ?? `${cur} `;
  const compactFmt = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
  return {
    money:  v => fmt.price(Math.round(v), cur),
    signed: v => (Math.round(v) > 0 ? '+' : '') + fmt.price(Math.round(v), cur),
    axisMoney: v => (v < 0 ? '−' : '') + sym + compactFmt.format(Math.abs(v)),
    axisCount: v => compactFmt.format(v),
  };
}
function niceTicks(min, max, count, integer) {
  if (min === max) max = min + (integer ? 1 : 1);
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

// ── Chart drawing ──────────────────────────────────────────────────────────
function drawVaultChart(host, key, months, animate) {
  const cfg = VAULT_CHARTS[key];
  const s = vaultSeries(_vaultData.watches, months);
  const f = chartFormatters(s.cur);
  const W = Math.max(300, Math.floor(host.clientWidth)), H = 300;
  const m = { l: 62, r: 16, t: 16, b: 34 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b, n = s.keys.length, band = iw / n;
  const bars = cfg.bars ? s[cfg.bars.key] : null;
  const line = cfg.line ? s[cfg.line.key] : null;

  // Axis scale belongs to one series (or both when they share units)
  const axisVals = cfg.axis === 'shared' ? [...bars, ...line] : cfg.axis === 'line' ? line : bars;
  const axisMoney = cfg.axis === 'bars' ? !!cfg.bars.money : true;
  const tk = niceTicks(Math.min(0, ...axisVals), Math.max(0, ...axisVals), 4, !axisMoney);
  const yAxis = v => m.t + (1 - (v - tk.lo) / (tk.hi - tk.lo)) * ih;
  const fitScale = vals => {                    // secondary series: fit into the lower 80%
    const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
    const span = hi - lo || 1;
    return v => m.t + ih * 0.2 + (1 - (v - lo) / span) * ih * 0.8;
  };
  const yBars = bars ? (cfg.axis === 'bars' || cfg.axis === 'shared' ? yAxis : fitScale(bars)) : null;
  const yLine = line ? (cfg.axis === 'line' || cfg.axis === 'shared' ? yAxis : fitScale(line)) : null;
  const cx = i => m.l + band * (i + 0.5);
  const fmtAxis = axisMoney ? f.axisMoney : f.axisCount;
  const fmtBar = cfg.bars?.money ? (cfg.bars.signed ? f.signed : f.money) : pieces;
  const fmtLine = cfg.line?.money ? (cfg.axis === 'shared' ? f.signed : f.money) : pieces;
  const id = 'vc' + Math.random().toString(36).slice(2, 8);

  let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" tabindex="0"
      aria-label="${esc(cfg.title)} chart. Use left and right arrow keys to read each month.">
    <defs>
      ${line ? `<linearGradient id="${id}a" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${cfg.line.color}" stop-opacity="0.28"/><stop offset="100%" stop-color="${cfg.line.color}" stop-opacity="0"/></linearGradient>` : ''}
    </defs>`;
  // grid + y labels
  for (const v of tk.ticks) {
    const y = yAxis(v).toFixed(1);
    svg += `<line class="vc-grid" x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}"/>
      <text class="vc-axis" x="${m.l - 10}" y="${y}" text-anchor="end" dominant-baseline="middle">${esc(fmtAxis(v))}</text>`;
  }
  if (tk.lo < 0) svg += `<line class="vc-zero" x1="${m.l}" x2="${W - m.r}" y1="${yAxis(0).toFixed(1)}" y2="${yAxis(0).toFixed(1)}"/>`;
  // x labels (thin out on long ranges); year shown under January / first month
  const every = n > 12 ? 2 : 1;
  s.short.forEach((lab, i) => {
    if (i % every && i !== n - 1) return;
    const showYear = i === 0 || s.keys[i].endsWith('-01');
    svg += `<text class="vc-axis vc-x" x="${cx(i).toFixed(1)}" y="${H - m.b + 16}" text-anchor="middle">${esc(lab)}${showYear ? ` ’${s.year[i]}` : ''}</text>`;
  });
  // crosshair (moved on hover)
  svg += `<line class="vc-cross" x1="0" x2="0" y1="${m.t}" y2="${m.t + ih}"/>`;
  // bars
  if (bars) {
    const bw = Math.min(28, band * 0.56);
    const y0 = yBars(0);
    bars.forEach((v, i) => {
      if (!v) return;
      const y1 = yBars(v), top = Math.min(y0, y1), h = Math.max(1, Math.abs(y1 - y0));
      const color = cfg.bars.signed ? (v >= 0 ? SPARK.green : SPARK.red) : cfg.bars.color;
      svg += `<rect class="vc-bar" data-i="${i}" x="${(cx(i) - bw / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="3"
        fill="${color}" fill-opacity="${line ? 0.55 : 0.85}" style="--d:${i * 35}ms; transform-origin: 0 ${y0.toFixed(1)}px; filter: drop-shadow(0 0 4px ${color}66)"/>`;
    });
  }
  // line + area + points
  if (line) {
    const pts = line.map((v, i) => [cx(i), yLine(v)]);
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    const base = yLine(Math.max(0, Math.min(...line))).toFixed(1);
    svg += `<path class="vc-area" d="${d} L${pts[n - 1][0].toFixed(1)},${base} L${pts[0][0].toFixed(1)},${base} Z" fill="url(#${id}a)"/>
      <path class="vc-line" d="${d}" pathLength="1" stroke="${cfg.line.color}" style="color:${cfg.line.color}"/>`;
    pts.forEach((p, i) => {
      svg += `<circle class="vc-pt" data-i="${i}" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3" fill="#0A0E14" stroke="${cfg.line.color}" stroke-width="2" style="--d:${i * 35}ms"/>`;
    });
  }
  svg += `<rect class="vc-hit" x="${m.l}" y="${m.t}" width="${iw}" height="${ih}" fill="transparent"/></svg>`;

  host.classList.toggle('no-anim', !animate);
  host.innerHTML = svg + `<div class="vd-tip" role="status" aria-live="polite"></div>`;

  // ── Interaction: crosshair + tooltip (pointer and keyboard) ──
  const el = host.querySelector('svg'), tip = host.querySelector('.vd-tip'), cross = host.querySelector('.vc-cross');
  let active = -1;
  const setActive = i => {
    if (i === active) return;
    active = i;
    host.classList.toggle('is-hovering', i >= 0);
    host.querySelectorAll('.vc-bar, .vc-pt').forEach(n2 => n2.classList.toggle('is-on', Number(n2.dataset.i) === i));
    if (i < 0) return;
    const x = cx(i);
    cross.setAttribute('x1', x); cross.setAttribute('x2', x);
    const rows = [];
    if (bars) {
      const v = bars[i], c = cfg.bars.signed ? (v >= 0 ? SPARK.green : SPARK.red) : cfg.bars.color;
      rows.push(`<div class="vd-tip-row"><span class="vd-key" style="background:${c}"></span>${esc(cfg.bars.label)}<b class="${cfg.bars.signed ? (v > 0 ? 'text-emerald-400' : v < 0 ? 'text-error' : '') : ''}">${esc(fmtBar(v))}</b></div>`);
    }
    if (line) rows.push(`<div class="vd-tip-row"><span class="vd-key vd-key-line" style="background:${cfg.line.color}"></span>${esc(cfg.line.label)}<b>${esc(fmtLine(line[i]))}</b></div>`);
    tip.innerHTML = `<p class="vd-tip-title">${esc(s.long[i])}</p>${rows.join('')}`;
    const tw = tip.offsetWidth || 180;
    let left = x + 14;
    if (left + tw > W - 4) left = x - tw - 14;
    tip.style.left = Math.max(4, left) + 'px';
  };
  el.addEventListener('pointermove', e => {
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) * (W / r.width);
    setActive(Math.max(0, Math.min(n - 1, Math.floor((px - m.l) / band))));
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
  const cfg = VAULT_CHARTS[key];
  const detail = tile.querySelector('.vault-detail');
  const legend = [
    cfg.bars ? (cfg.bars.signed
      ? `<span><i class="vd-key" style="background:${SPARK.green}"></i>Gain</span><span><i class="vd-key" style="background:${SPARK.red}"></i>Loss</span>`
      : `<span><i class="vd-key" style="background:${cfg.bars.color}"></i>${esc(cfg.bars.label)}</span>`) : '',
    cfg.line ? `<span><i class="vd-key vd-key-line" style="background:${cfg.line.color}"></i>${esc(cfg.line.label)}</span>` : '',
  ].join('');
  detail.innerHTML = `
    <div class="flex items-center justify-between gap-3 flex-wrap mb-3">
      <div>
        <p class="text-sm font-semibold text-on-surface">${esc(cfg.title)}</p>
        <div class="vd-legend">${legend}</div>
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
  const m = chartFormatters(s.cur);
  detail.querySelector('.vd-summary').innerHTML = cfg.summary(s, m).map(([label, value, sub, tone]) => `
    <div class="vd-stat${tone ? ' is-' + tone : ''}">
      <p class="vd-stat-label">${esc(label)}</p>
      <p class="vd-stat-value">${esc(value)}</p>
      ${sub ? `<p class="vd-stat-sub">${esc(sub)}</p>` : ''}
    </div>`).join('');
  detail.querySelector('.vd-note').textContent = cfg.note(s);

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
  if (!_vaultData || !VAULT_CHARTS[key] || _vaultChart.key === key) return;
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
