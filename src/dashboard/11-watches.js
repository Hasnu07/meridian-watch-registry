// 11-watches.js — Watches page
// Part of the dashboard script: scripts/build.js concatenates src/dashboard/*.js
// in filename order into public/js/dashboard.js (one classic script, so
// functions and top-level variables stay shared exactly as before).

// ── Watches page ───────────────────────────────────────────────────────────
let allWatches = [];
const watchCache = {};           // id → watch, populated from all sources
let watchPage  = 1;
let watchStatusFilter = '';

async function loadWatches(q, source) {
  const stats = await api('GET', '/api/stats');

  // Multi-currency aware tiles — fall back to '—' when empty
  document.getElementById('wv-value').innerHTML       = fmt.byCurrency(stats.total_value);
  document.getElementById('wv-active').innerHTML      = fmt.byCurrency(stats.active_list_value);
  document.getElementById('wv-proceeds').innerHTML    = fmt.byCurrency(stats.total_sale_value);
  document.getElementById('wv-pnl').innerHTML         = fmt.byCurrency(stats.net_pnl, { signed: true, colour: true });
  // Subtext: counts feeding each tile
  document.getElementById('wv-active-sub').textContent   = `${stats.purchased_count} purchased`;
  document.getElementById('wv-proceeds-sub').textContent = `${stats.sold_count} sold`;
  document.getElementById('wv-pnl-sub').textContent      = `${stats.sold_count} sold · ${stats.total_watches} total pieces`;
  // Legacy hidden element
  document.getElementById('wv-total').textContent = stats.total_watches.toLocaleString();

  const params = new URLSearchParams();
  if (q)      params.set('q', q);
  if (source) params.set('source', source);
  allWatches = await api('GET', `/api/watches?${params}`);
  allWatches.forEach(w => { watchCache[w.id] = w; });
  // Trend lines describe the whole inventory, so only redraw on an unfiltered load
  if (!q && !source) renderWatchSparklines(allWatches);
  watchPage  = 1;
  renderWatches();
  renderWishlistWaiting();
}

function renderWatchSparklines(watches) {
  const t = watchTrendSeries(watches);
  const pnlTotal = t.pnl.reduce((a, b) => a + b, 0);
  document.getElementById('wv-value-spark').innerHTML    = sparkBlock(t.proceeds,  { color: SPARK.cyan,   caption: `sales value / month · ${t.currency}`, label: 'Sales value per month' });
  document.getElementById('wv-active-spark').innerHTML   = sparkBlock(t.bought,    { color: SPARK.violet, caption: 'pieces bought / month', label: 'Pieces bought per month' });
  document.getElementById('wv-proceeds-spark').innerHTML = sparkBlock(t.soldCount, { color: SPARK.pink,   caption: 'pieces sold / month', label: 'Pieces sold per month' });
  document.getElementById('wv-pnl-spark').innerHTML      = sparkBlock(t.pnl,       { color: pnlTotal >= 0 ? SPARK.green : SPARK.red, caption: `P&L / month · ${t.currency}`, label: 'Profit and loss per month' });
}

function renderWatches() {
  // status tab → quick filter (saved filters) → sort → page
  let filtered = watchStatusFilter ? allWatches.filter(w => w.status === watchStatusFilter) : allWatches;
  filtered = applyQuickFilter(filtered);
  filtered = sortWatchList(filtered);
  renderQuickFilterBar();
  const total = filtered.length;
  const slice = filtered.slice((watchPage - 1) * PER_PAGE, watchPage * PER_PAGE);
  const asCards = getView('watches') === 'cards';
  const body = document.getElementById('watchesBody');
  body.className = asCards
    ? 'p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 auto-rows-fr gap-4'
    : 'divide-y divide-white/[0.04]';
  body.innerHTML = slice.map(w => asCards ? watchTileHtml(w) : watchCard(w)).join('')
    || `<div class="col-span-full px-6 py-16 text-center text-on-surface-variant text-sm">No watches found.</div>`;
  renderPagination('watchesPagination', watchPage, total, PER_PAGE, n => { watchPage = n; renderWatches(); });
}

function watchCard(w) {
  const cur   = w.currency || 'CHF';
  const thumb = w.image_path
    ? `<img src="${w.image_path}" class="w-full h-full object-cover cursor-zoom-in" onclick="openLightbox('${w.image_path}')">`
    : `<span class="material-symbols-outlined text-outline text-[28px]">watch</span>`;
  const meta = [
    w.stock_number   ? `<span><span class="text-outline">Stock</span> <span class="font-mono text-on-surface">${esc(w.stock_number)}</span></span>` : null,
    w.serial_number  ? `<span><span class="text-outline">S/N</span> ${esc(w.serial_number)}</span>` : null,
    w.purchase_date  ? `<span><span class="text-outline">Date</span> ${fmt.date(w.purchase_date)}</span>` : null,
    w.list_price != null ? `<span class="text-on-surface font-semibold">${fmt.price(w.list_price, cur)}</span>` : null,
    w.status === 'sold' && w.sale_price != null ? `<span class="text-emerald-400 font-semibold">Sold ${fmt.price(w.sale_price, cur)}</span>` : null,
    w.reference_number ? `<span><span class="text-outline">Ref</span> ${esc(w.reference_number)}</span>` : null,
  ].filter(Boolean).join('<span class="text-outline/40 mx-1.5">·</span>');
  return `
  <div class="tbl-row flex items-center gap-4 px-5 py-3 transition-colors group">
    <div class="w-12 h-12 rounded-md bg-surface-container border border-outline-variant/15 flex items-center justify-center flex-shrink-0 overflow-hidden">
      ${thumb}
    </div>
    <div class="flex-1 min-w-0">
      <div class="flex items-start justify-between gap-3 flex-wrap mb-1.5">
        <p class="text-on-surface font-semibold text-sm leading-snug">${esc(w.model)}</p>
        <div class="flex items-center gap-2 flex-shrink-0">
          ${statusBadge(w.status)}
        </div>
      </div>
      <p class="text-xs text-on-surface-variant mb-1.5">
        ${esc(w.client_name || '—')}
        ${w.shop_name ? `<span class="text-outline/50 mx-1">·</span><span class="text-outline">${esc(w.shop_name)}</span>` : ''}
      </p>
      ${meta ? `<p class="text-xs text-on-surface-variant font-mono flex flex-wrap gap-x-0 gap-y-1">${meta}</p>` : ''}
    </div>
    <div class="flex items-center gap-1.5 flex-shrink-0 opacity-60 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
      <button onclick="openWatchDetail(${w.id})" title="View watch detail" class="p-2 rounded-lg hover:bg-surface-variant/30 text-on-surface-variant hover:text-sky-400 transition-colors">
        <span class="material-symbols-outlined text-[18px]">open_in_new</span>
      </button>
      ${w.status !== 'sold' ? `<button onclick="openMarkSoldModal(${w.id})" title="Mark as Sold" class="text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1.5 rounded-lg border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition-all flex items-center gap-1">
        <span class="material-symbols-outlined text-[13px]">sell</span> Sold
      </button>` : ''}
      <button onclick="openEditWatch(${w.id})" class="p-2 rounded-lg hover:bg-surface-variant/30 text-on-surface-variant hover:text-primary transition-colors">
        <span class="material-symbols-outlined text-[18px]">edit</span>
      </button>
      <button onclick="confirmDeleteWatch(${w.id},'${esc(w.model).replace(/'/g,"\\'")}')">
        <span class="p-2 rounded-lg hover:bg-error/10 text-on-surface-variant hover:text-error transition-colors block">
          <span class="material-symbols-outlined text-[18px]">delete</span>
        </span>
      </button>
    </div>
  </div>`;
}

// Wishlist panel can be collapsed; remembered per browser (falls back to open)
let _wishlistCollapsed = (() => {
  try { return localStorage.getItem('meridian.wishlistCollapsed') === '1'; } catch { return false; }
})();
function applyWishlistCollapsed() {
  const collapsed = _wishlistCollapsed;
  document.getElementById('wishlistWaitingBody').classList.toggle('hidden', collapsed);
  document.getElementById('wishlistToggle').setAttribute('aria-expanded', String(!collapsed));
  document.getElementById('wishlistToggle').classList.toggle('border-b', !collapsed);
  document.getElementById('wishlistChevron').style.transform = collapsed ? 'rotate(180deg)' : '';
  document.getElementById('wishlistToggleLabel').textContent = collapsed ? 'Show' : 'Hide';
}
document.getElementById('wishlistToggle').addEventListener('click', () => {
  _wishlistCollapsed = !_wishlistCollapsed;
  try { localStorage.setItem('meridian.wishlistCollapsed', _wishlistCollapsed ? '1' : '0'); } catch {}
  applyWishlistCollapsed();
});

function renderWishlistWaiting() {
  // Longest-waiting first: the most urgent pieces sit at the top
  const wishlist = allWatches.filter(w => w.status === 'wishlist')
    .sort((a, b) => (wishlistDays(b) ?? -1) - (wishlistDays(a) ?? -1));
  const section = document.getElementById('wishlistWaitingSection');
  if (!wishlist.length) { section.classList.add('hidden'); return; }
  section.classList.remove('hidden');
  document.getElementById('wishlistCount').textContent = wishlist.length;
  applyWishlistCollapsed();
  const now = Date.now();
  document.getElementById('wishlistWaitingBody').innerHTML = wishlist.map(w => {
    const added  = new Date(w.created_at).getTime();
    const days   = Math.floor((now - added) / 86400000);
    const urgency = days >= 30 ? 'text-error' : days >= 14 ? 'text-amber-400' : 'text-on-surface-variant';
    return `
    <div class="tbl-row px-5 py-2.5 flex items-center gap-4">
      <div class="w-9 h-9 rounded-md bg-surface-container border border-outline-variant/15 flex items-center justify-center flex-shrink-0 overflow-hidden">
        ${w.image_path ? `<img src="${w.image_path}" class="w-full h-full object-cover">` : '<span class="material-symbols-outlined text-outline text-[18px]">watch</span>'}
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium text-on-surface truncate">${esc(w.model)}${w.stock_number ? ` <span class="font-mono text-xs text-outline">· ${esc(w.stock_number)}</span>` : ''}</p>
        <p class="text-xs text-on-surface-variant">${esc(w.client_name || '—')}</p>
      </div>
      <div class="text-right flex-shrink-0">
        <p class="font-mono text-lg font-semibold leading-none ${urgency}">${days}<span class="text-xs font-sans font-medium text-outline ml-1">${days === 1 ? 'day' : 'days'}</span></p>
      </div>
    </div>`;
  }).join('');
}


function avatarHtml(name, photoPath, size = 'sm') {
  const dim    = size === 'lg' ? 'w-16 h-16 text-xl' : 'w-10 h-10 text-sm';
  const initials = esc(fmt.initials(name));
  if (photoPath) {
    return `<div class="${dim} rounded-full border border-outline-variant/30 overflow-hidden flex-shrink-0"><img src="${photoPath}" class="w-full h-full object-cover" alt="${initials}"></div>`;
  }
  return `<div class="${dim} rounded-full bg-surface-variant flex items-center justify-center text-primary font-semibold flex-shrink-0">${initials}</div>`;
}

function statusBadge(status) {
  if (status === 'sold')      return `<span class="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block shadow-[0_0_6px_#2CFFA8]"></span>Sold</span>`;
  if (status === 'purchased') return `<span class="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-purple-400/10 text-purple-300 border border-purple-400/30"><span class="w-1.5 h-1.5 rounded-full bg-purple-400 inline-block shadow-[0_0_6px_#B18CFF]"></span>Purchased</span>`;
  return `<span class="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-400/10 text-amber-300 border border-amber-400/25"><span class="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block shadow-[0_0_6px_#FFC233]"></span>Wishlist</span>`;
}

function plBadge(listPrice, salePrice, cur) {
  if (listPrice == null || salePrice == null) return '<span class="text-outline text-xs">—</span>';
  const diff = salePrice - listPrice;
  const cls  = diff >= 0 ? 'text-emerald-400' : 'text-red-400';
  const sign = diff >= 0 ? '+' : '';
  return `<span class="text-xs font-semibold font-mono ${cls}">${sign}${fmt.price(diff, cur || 'CHF')}</span>`;
}

// Track which rows are expanded (across re-renders) so the user's "open" state survives a refresh
const _expandedWatchRows = new Set();
function toggleWatchRow(id) {
  if (_expandedWatchRows.has(id)) _expandedWatchRows.delete(id);
  else                            _expandedWatchRows.add(id);
  const detailEl = document.getElementById(`watchDetail-${id}`);
  const chev     = document.getElementById(`watchChev-${id}`);
  if (detailEl) detailEl.classList.toggle('hidden', !_expandedWatchRows.has(id));
  if (chev)     chev.style.transform = _expandedWatchRows.has(id) ? 'rotate(90deg)' : '';
}

// Build the expandable details banner for a single watch
function watchDetailBanner(w) {
  const cur = w.currency || 'CHF';
  const mc  = v => v == null || v === '' ? '<span class="text-outline">—</span>' : fmt.price(v, cur);

  // ── Expenses sub-section (shared by purchased + sold) ──────────────────
  function expensesSection(canAdd) {
    const activeExpenses = (w.expenses || []).filter(ex => !ex.reversed);
    // Multi-currency aware total: group by expense currency, render each line.
    const totalByCur = {};
    for (const ex of activeExpenses) {
      const ec = ex.currency || cur;
      totalByCur[ec] = (totalByCur[ec] || 0) + ex.amount;
    }
    const totalsLabel = Object.entries(totalByCur).map(([c, v]) => fmt.price(v, c)).join(' · ');
    const rows = activeExpenses.map(ex => `
      <div class="flex items-center gap-3 py-1">
        <span class="text-[11px] font-mono text-on-surface-variant w-16 flex-shrink-0">${ex.date || '—'}</span>
        <span class="text-[11px] px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 flex-shrink-0">${expenseCategoryLabel(ex.category)}</span>
        <span class="flex-1 text-[11px] text-on-surface-variant truncate">${esc(ex.description || '')}</span>
        <span class="font-mono text-[11px] text-sky-300 flex-shrink-0">${fmt.price(ex.amount, ex.currency || cur)}</span>
        <button onclick="reverseExpense(${ex.id}, ${w.id})" title="Void expense" class="hover:text-error transition-colors flex-shrink-0">
          <span class="material-symbols-outlined text-[13px] text-on-surface-variant">close</span>
        </button>
      </div>`).join('');
    return `
      <div class="col-span-full pt-3 mt-3 border-t border-sky-500/10">
        <div class="flex items-center justify-between mb-1.5">
          <p class="text-[11px] uppercase tracking-wider text-sky-400/70">Expenses${activeExpenses.length > 0 ? ` · ${totalsLabel}` : ''}</p>
          ${canAdd ? `<button onclick="openAddExpenseModal(${w.id})" class="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border border-sky-500/30 text-sky-400 bg-sky-500/5 hover:bg-sky-500/10 transition-all flex items-center gap-1">
            <span class="material-symbols-outlined text-xs">add</span> Add
          </button>` : ''}
        </div>
        ${activeExpenses.length === 0
          ? `<p class="text-[11px] text-on-surface-variant/40 italic">No expenses recorded</p>`
          : rows}
      </div>`;
  }

  // ── Outstanding sub-section (shared by purchased + sold) ───────────────
  function outstandingSection() {
    const cBal = watchPayoutBalance(w, 'client');
    const mBal = watchPayoutBalance(w, 'my');
    const hasAny = cBal.owed > 0 || mBal.owed > 0 || cBal.paid > 0 || mBal.paid > 0;
    if (!hasAny) return '';
    return `
      <div class="col-span-full pt-3 mt-3 border-t border-outline-variant/10 grid grid-cols-2 gap-4">
        <!-- Client -->
        <div class="flex items-center gap-2 flex-wrap">
          <p class="text-[11px] uppercase tracking-wider text-purple-300/70">Client</p>
          ${payoutStatusBadge(cBal.status, w.status === 'sold' ? 'post_sale' : 'pre_sale')}
          ${cBal.debt > 0
            ? `<span class="text-[11px] text-error">client owes ${fmt.price(cBal.debt, cur)}</span><span class="text-[11px] text-outline/60">— see Panel B</span>`
            : `<span class="text-[11px] text-on-surface-variant">remaining</span>
          <span class="font-mono text-xs text-purple-300">${fmt.price(Math.max(0, cBal.remaining), cur)}</span>
          <span class="text-[11px] text-outline/60">(owed ${fmt.price(cBal.owed, cur)} · paid ${fmt.price(cBal.paid, cur)})</span>`}
          <button onclick="openRecordPayoutModal(${w.id}, 'client')" class="ml-auto text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border border-purple-400/30 text-purple-300 bg-purple-500/5 hover:bg-purple-500/10 transition-all flex items-center gap-1">
            <span class="material-symbols-outlined text-xs">payments</span> Pay
          </button>
        </div>
        <!-- Me -->
        <div class="flex items-center gap-2 flex-wrap">
          <p class="text-[11px] uppercase tracking-wider text-amber-300/70">Me</p>
          ${payoutStatusBadge(mBal.status, w.status === 'sold' ? 'post_sale' : 'pre_sale')}
          <span class="text-[11px] text-on-surface-variant">remaining</span>
          <span class="font-mono text-xs text-amber-300">${fmt.price(Math.max(0, mBal.remaining), cur)}</span>
          <span class="text-[11px] text-outline/60">(owed ${fmt.price(mBal.owed, cur)} · paid ${fmt.price(mBal.paid, cur)})</span>
          <button onclick="openRecordPayoutModal(${w.id}, 'my')" class="ml-auto text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border border-amber-400/30 text-amber-300 bg-amber-500/5 hover:bg-amber-500/10 transition-all flex items-center gap-1">
            <span class="material-symbols-outlined text-xs">account_balance_wallet</span> Withdraw
          </button>
        </div>
      </div>`;
  }

  if (w.status === 'wishlist') {
    return `
      <div class="px-12 py-4 bg-amber-500/[0.04] border-y border-amber-500/15 grid grid-cols-3 gap-6 text-xs">
        <div><p class="text-[11px] uppercase tracking-wider text-on-surface-variant mb-0.5">Wishlist Since</p><p class="text-on-surface">${fmt.date(w.purchase_date) || ((w.created_at || '').split(' ')[0]) || '—'}</p></div>
        <div><p class="text-[11px] uppercase tracking-wider text-on-surface-variant mb-0.5">Reference</p><p class="text-on-surface font-mono">${esc(w.reference_number || '—')}</p></div>
        <div><p class="text-[11px] uppercase tracking-wider text-on-surface-variant mb-0.5">Notes</p><p class="text-on-surface-variant truncate">${esc(w.notes || '—')}</p></div>
      </div>`;
  }

  if (w.status === 'purchased') {
    return `
      <div class="px-12 py-4 bg-blue-500/[0.04] border-y border-blue-500/15 text-xs">
        <div class="grid grid-cols-4 gap-6">
          <div><p class="text-[11px] uppercase tracking-wider text-on-surface-variant mb-0.5">I Paid</p><p class="font-mono text-emerald-400">${mc(w.my_cost)}</p></div>
          <div><p class="text-[11px] uppercase tracking-wider text-on-surface-variant mb-0.5">Client Paid</p><p class="font-mono text-purple-300">${mc(w.client_cost)}</p></div>
          <div><p class="text-[11px] uppercase tracking-wider text-on-surface-variant mb-0.5">Total Invested</p><p class="font-mono text-primary">${mc((w.my_cost || 0) + (w.client_cost || 0))}</p></div>
          <div class="flex items-end justify-end">
            <button onclick="openMarkSoldModal(${w.id})" class="text-[11px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-lg border border-emerald-500/40 text-emerald-400 bg-emerald-500/5 hover:bg-emerald-500/15 transition-all flex items-center gap-1.5">
              <span class="material-symbols-outlined text-[14px]">sell</span> Mark Sold
            </button>
          </div>
        </div>
        ${outstandingSection()}
        ${expensesSection(true)}
      </div>`;
  }

  if (w.status === 'sold') {
    const list = w.list_price, sale = w.sale_price;
    // Use split-rule-derived P&L from the shared helper (conserves: my + client = gross)
    const mBalSold   = watchPayoutBalance(w, 'my');
    const cBalSold   = watchPayoutBalance(w, 'client');
    const dcw        = mBalSold.dc;   // set for discount-profile watches
    const gross = dcw ? dcw.rawDiff : (list != null && sale != null) ? (sale - list) : null;
    const myGain     = mBalSold.share;
    const clientGain = cBalSold.share;
    const sgn = v => v > 0 ? '+' : '';
    const cls = v => v == null ? 'text-outline' : v >= 0 ? 'text-emerald-400' : 'text-error';
    return `
      <div class="px-12 py-4 bg-emerald-500/[0.04] border-y border-emerald-500/15 text-xs">
        <div class="grid grid-cols-6 gap-6 mb-3">
          <div><p class="text-[11px] uppercase tracking-wider text-on-surface-variant mb-0.5">List</p><p class="font-mono text-on-surface">${mc(list)}</p></div>
          ${dcw?.isProfit
            ? `<div><p class="text-[11px] uppercase tracking-wider text-on-surface-variant mb-0.5">Market → Client Price</p><p class="font-mono text-primary">${mc(dcw.P)} → ${mc(dcw.clientPrice)}</p><p class="text-[11px] text-on-surface-variant/60">${(dcw.discPct * 100).toFixed(2)}% ${dcw.manual ? 'manual' : 'standard'}${dcw.offset ? ' · offset ' + fmt.price(dcw.offset, cur) : ''} · wire ${fmt.price(dcw.wire, cur)}</p></div>`
            : `<div><p class="text-[11px] uppercase tracking-wider text-on-surface-variant mb-0.5">Sold For</p><p class="font-mono text-primary">${mc(sale)}</p>${dcw?.clientOwesMe > 0 ? `<p class="text-[11px] text-error/80">client owes ${fmt.price(dcw.clientOwesMe, cur)}</p>` : ''}</div>`}
          <div><p class="text-[11px] uppercase tracking-wider text-on-surface-variant mb-0.5">Gross P&amp;L</p><p class="font-mono ${cls(gross)}">${gross != null ? sgn(gross)+fmt.price(gross, cur) : '—'}</p></div>
          <div><p class="text-[11px] uppercase tracking-wider text-on-surface-variant mb-0.5">Sold To</p><p class="text-on-surface truncate">${esc(w.sold_to || '—')}</p></div>
          <div><p class="text-[11px] uppercase tracking-wider text-on-surface-variant mb-0.5">Sold Date</p><p class="text-on-surface">${fmt.date(w.purchase_date) || '—'}</p></div>
          <div><p class="text-[11px] uppercase tracking-wider text-on-surface-variant mb-0.5">Reference</p><p class="font-mono text-on-surface">${esc(w.reference_number || '—')}</p></div>
        </div>
        <div class="grid grid-cols-2 gap-6 pt-3 border-t border-emerald-500/10">
          <div class="grid grid-cols-3 gap-3 text-[11px]">
            <div><p class="text-on-surface-variant">My Cost</p><p class="font-mono text-on-surface">${mc(w.my_cost)}</p></div>
            <div><p class="text-on-surface-variant">Paid to me</p><p class="font-mono text-emerald-400">${fmt.price(mBalSold.paid, cur)}</p></div>
            <div><p class="text-on-surface-variant">My P&amp;L</p><p class="font-mono ${cls(myGain)}">${myGain != null ? sgn(myGain)+fmt.price(myGain, cur) : '—'}</p></div>
          </div>
          <div class="grid grid-cols-3 gap-3 text-[11px]">
            <div><p class="text-on-surface-variant">Client Cost</p><p class="font-mono text-purple-300">${mc(w.client_cost)}</p></div>
            <div><p class="text-on-surface-variant">Paid to client</p><p class="font-mono text-purple-300">${fmt.price(cBalSold.paid, cur)}</p></div>
            <div><p class="text-on-surface-variant">Client P&amp;L</p><p class="font-mono ${cls(clientGain)}">${clientGain != null ? sgn(clientGain)+fmt.price(clientGain, cur) : '—'}</p></div>
          </div>
        </div>
        ${outstandingSection()}
        ${expensesSection(true)}
      </div>`;
  }
  return '';
}

function watchRow(w, detail, opts) {
  const isDiscountRow = watchRule(w, { trading_rule: opts?.isDiscount ? 'discount' : 'split' }) === 'discount';
  const thumb = w.image_path
    ? `<img src="${w.image_path}" class="w-full h-full object-cover" alt="${esc(w.model)}" onclick="openLightbox('${w.image_path}')" style="cursor:zoom-in">`
    : `<span class="material-symbols-outlined text-outline text-[22px]">watch</span>`;
  const clientCell = detail ? '' : `
    <td class="px-5 py-3">
      <button onclick="openProfileDetail(${w.profile_id})" class="text-on-surface-variant text-sm hover:text-primary transition-colors">${esc(w.client_name || '—')}</button>
    </td>`;
  const cur = w.currency || 'CHF';
  const shopCell = detail ? '' : `<td class="px-5 py-3 text-on-surface-variant text-sm">${esc(w.shop_name || '—')}</td>`;

  // P&L / Settlement cell for profile-detail view
  function detailPnlCell() {
    if (!isDiscountRow) return `<td class="px-5 py-3">${plBadge(w.list_price, w.status === 'sold' ? w.sale_price : null, cur)}</td>`;
    // Discount mode
    if (w.status !== 'sold') return `<td class="px-5 py-3"><span class="text-outline text-xs">—</span></td>`;
    if (w.list_price != null && (w.sale_price != null || w.market_price != null)) {
      const d = discountCalc(w, { discount_split: opts?.discountSplit });
      if (d.isProfit) {
        // Handover: effective discount £ and %
        return `<td class="px-5 py-3"><span class="text-xs font-semibold font-mono text-amber-400">+${fmt.price(d.discAmt, cur)}</span><span class="block text-[11px] text-on-surface-variant/60 mt-0.5">${(d.discPct*100).toFixed(2)}% disc.${d.manual ? ' · manual' : ''}</span></td>`;
      } else if (d.isLoss) {
        // Loss: settlement badge + record button
        const stMap   = { open: 'text-error border-error/30 bg-error/5', partially_paid: 'text-amber-400 border-amber-400/30 bg-amber-400/5', settled: 'text-emerald-400 border-emerald-400/30 bg-emerald-400/5', not_applicable: 'text-on-surface-variant border-outline-variant/30 bg-white/[0.02]' };
        const stLabel = { open: 'Open', partially_paid: 'Partial', settled: 'Settled', not_applicable: 'No debt' };
        const st      = w.loss_status || 'open';
        const canPay  = st !== 'settled' && st !== 'not_applicable';
        return `<td class="px-5 py-3">
          <div class="flex items-center gap-1.5">
            <span class="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md border ${stMap[st] || stMap.open}">${stLabel[st] || st}</span>
            ${canPay ? `<button onclick="openRecordPaymentModal(${w.id})" title="Record payment" class="text-[11px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-md border border-amber-400/30 text-amber-400 bg-amber-400/5 hover:bg-amber-400/10 transition-all">Pay</button>` : ''}
          </div>
        </td>`;
      }
    }
    return `<td class="px-5 py-3"><span class="text-outline text-xs">—</span></td>`;
  }

  const detailPriceCols = detail ? `
      <td class="px-5 py-3">${statusBadge(w.status)}</td>
      <td class="px-5 py-3 text-on-surface-variant text-sm font-mono whitespace-nowrap">${w.stock_number ? esc(w.stock_number) : '<span class="text-outline">—</span>'}</td>
      <td class="px-5 py-3 text-on-surface-variant text-sm font-mono">${esc(w.serial_number || '—')}</td>
      <td class="px-5 py-3 text-on-surface-variant text-sm">${fmt.price(w.list_price, cur)}</td>
      <td class="px-5 py-3 text-primary font-semibold text-sm">${w.status !== 'sold' ? '<span class="text-outline">—</span>'
        : (w.market_price != null) ? `${fmt.price(isDiscountRow ? discountCalc(w, { discount_split: opts?.discountSplit }).clientPrice : w.sale_price, cur)}<span class="block text-[11px] text-on-surface-variant/60 font-normal mt-0.5">handover · market ${fmt.price(w.market_price, cur)}</span>` : fmt.price(w.sale_price, cur)}</td>
      ${detailPnlCell()}` : `
      <td class="px-5 py-3">${statusBadge(w.status)}</td>
      <td class="px-5 py-3 text-on-surface-variant text-sm font-mono">${esc(w.serial_number || '—')}</td>
      <td class="px-5 py-3 text-on-surface-variant text-sm">${fmt.date(w.purchase_date)}</td>
      <td class="px-5 py-3 font-semibold text-primary text-sm">${fmt.price(w.list_price ?? w.price, cur)}</td>
      <td class="px-5 py-3 text-on-surface-variant text-xs font-mono">${esc(w.reference_number || '—')}</td>`;
  // Detail view: include an expand chevron + emit a second row with the banner.
  // Default-collapsed; user toggles it via the chevron.
  const isOpen = _expandedWatchRows.has(w.id);
  const expandChev = detail ? `
    <button onclick="toggleWatchRow(${w.id})" class="p-1 -ml-1 mr-1 rounded hover:bg-white/[0.04] transition-colors flex-shrink-0" title="${isOpen ? 'Collapse' : 'Expand'}">
      <span id="watchChev-${w.id}" class="material-symbols-outlined text-on-surface-variant text-[18px] transition-transform" style="transform:${isOpen ? 'rotate(90deg)' : 'rotate(0deg)'}">chevron_right</span>
    </button>` : '';

  const colSpan = detail ? 8 : 7; // detail table: + Stock # column
  const detailBannerRow = detail ? `
    <tr id="watchDetail-${w.id}" class="${isOpen ? '' : 'hidden'}">
      <td colspan="${colSpan}" class="p-0">
        ${watchDetailBanner(w)}
      </td>
    </tr>` : '';

  return `
    <tr class="tbl-row">
      <td class="px-5 py-3">
        <div class="flex items-center gap-3">
          ${expandChev}
          <div class="w-12 h-12 rounded-lg bg-surface-container border border-outline-variant/15 flex items-center justify-center flex-shrink-0 overflow-hidden">
            ${thumb}
          </div>
          <div>
            <p class="text-on-surface font-medium text-sm leading-tight">${esc(w.model)}</p>
            ${w.serial_number ? `<p class="text-on-surface-variant text-xs mt-0.5 font-mono">${esc(w.serial_number)}</p>` : ''}
          </div>
        </div>
      </td>
      ${clientCell}
      ${shopCell}
      ${detailPriceCols}
      <td class="px-5 py-3">
        <div class="flex items-center justify-end gap-1.5">
          <button onclick="openWatchDetail(${w.id})" title="View watch detail" class="p-2 rounded-lg hover:bg-surface-variant/30 text-on-surface-variant hover:text-sky-400 transition-colors">
            <span class="material-symbols-outlined text-[18px]">open_in_new</span>
          </button>
          ${w.status !== 'sold' ? `<button onclick="openMarkSoldModal(${w.id})" title="Mark as Sold" class="text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1.5 rounded-lg border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition-all flex items-center gap-1">
            <span class="material-symbols-outlined text-[13px]">sell</span> Sold
          </button>` : ''}
          <button onclick="openEditWatch(${w.id})" class="p-2 rounded-lg hover:bg-surface-variant/30 text-on-surface-variant hover:text-primary transition-colors">
            <span class="material-symbols-outlined text-[18px]">edit</span>
          </button>
          <button onclick="confirmDeleteWatch(${w.id},'${esc(w.model).replace(/'/g,"\\'")}')">
            <span class="p-2 rounded-lg hover:bg-error/10 text-on-surface-variant hover:text-error transition-colors block">
              <span class="material-symbols-outlined text-[18px]">delete</span>
            </span>
          </button>
        </div>
      </td>
    </tr>
    ${detailBannerRow}`;
}

let _soldWatchData = null;

function openMarkSoldModal(id) {
  const w = allWatches.find(x => x.id === id) || watchCache[id];
  if (!w) return;
  _soldWatchData = w;

  // Thumb
  const thumb = document.getElementById('soldWatchThumb');
  if (w.image_path) {
    thumb.innerHTML = `<img src="${w.image_path}" class="w-full h-full object-cover">`;
  } else {
    thumb.innerHTML = `<span class="material-symbols-outlined text-2xl">watch</span>`;
  }
  document.getElementById('soldWatchModel').textContent = w.model;
  const cur = w.currency || 'CHF';
  document.getElementById('soldWatchListPrice').textContent = (w.stock_number ? `Stock ${w.stock_number} · ` : '') + (w.list_price != null ? `List: ${fmt.price(w.list_price, cur)}` : 'No list price set');
  document.getElementById('soldCurrencyBadge').textContent = cur;
  document.getElementById('soldMyCurLabel').textContent     = `(${cur})`;
  document.getElementById('soldClientCurLabel').textContent = `(${cur})`;

  // Pre-fill sale price + proceeds split (if already set)
  setMoneyValue('soldSalePrice',      w.sale_price);
  setMoneyValue('soldMyReceived',     w.my_received);
  setMoneyValue('soldClientReceived', w.client_received);
  document.getElementById('soldTo').value = w.sold_to || '';
  // Default sale date to today; user can edit
  document.getElementById('soldSaleDate').value = new Date().toISOString().split('T')[0];

  // Reset the Discount Split v2 section until the profile has loaded
  _soldIsDiscount = false; _soldProfile = null; _soldAvailOffset = 0; _soldRule = null; _soldDiscPrefilled = false;
  document.getElementById('soldError').classList.add('hidden');
  document.getElementById('soldRuleWrap').classList.add('hidden');
  document.getElementById('soldDiscountModeWrap').classList.add('hidden');
  document.getElementById('soldHandoverFields').classList.add('hidden');
  ['soldSalePriceWrap', 'soldSplitWrap', 'soldToWrap', 'soldPnlPreview'].forEach(i => document.getElementById(i).classList.remove('hidden'));
  document.getElementById('soldSaleDateLabel').textContent = 'Sale Date';
  document.getElementById('soldConfirmLabel').textContent  = 'Confirm Sale';
  document.getElementById('soldModalTitle').textContent    = 'Mark as Sold';

  updateSoldPnl();
  updateSoldSplitFooter();
  document.getElementById('markSoldModal').classList.remove('hidden');
  setTimeout(() => document.getElementById('soldSalePrice').focus(), 50);
  loadSoldModalProfile(w);
}
