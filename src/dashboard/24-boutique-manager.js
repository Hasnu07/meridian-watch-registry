// 24-boutique-manager.js — the Boutique Manager role
// A boutique manager is a user created by a master for ONE shop of a registry.
// They see four things — Vault, Shop, Watches, Wishlist — for that shop only,
// read-only. The server (routes/boutique.js) already filters and strips the
// data: no stock numbers, no resale prices, no costs, payouts, split rules,
// other users or settings; it does send the commission recorded on each piece.
// This file adapts the dashboard to that: trims navigation, guards pages,
// swaps the Vault / Watches tiles for shop figures and renders a simple watch
// page. public/style.css (`html.role-bm …`) hides the buttons that would only
// lead to a 403. Nothing here runs for other roles.
// Part of the dashboard script: scripts/build.js concatenates src/dashboard/*.js
// in filename order into public/js/dashboard.js (one classic script, so
// functions and top-level variables stay shared exactly as before).

const BM_PAGES = ['dashboard', 'shops', 'shop-detail', 'watches', 'watch-detail', 'commissions'];

function isBoutiqueManager() { return currentUser?.role === 'boutique_manager'; }
function bmShopName() { return currentUser?.shop?.name || 'your shop'; }

// For a boutique manager a piece is either on the wishlist or handed over to
// the client (the server maps purchased/sold → 'handed_over'; they never learn
// whether it was resold). Quick filters that only make sense for them:
const BM_QUICK_FILTERS = [
  { id: 'handedMonth',    label: 'Handed over this month', icon: 'handshake', test: w => w.status === 'handed_over' && isThisMonth(w.purchase_date) },
  { id: 'withCommission', label: 'With commission',        icon: 'payments',  test: w => w.commission != null },
];
// …and the ones about reselling that must go (they would show nothing anyway)
const BM_DROP_QUICK_FILTERS = ['soldMonth', 'held60'];

// Called from refreshCurrentUser() every time the session user is (re)loaded
function applyRoleUi(user) {
  const bm = user?.role === 'boutique_manager';
  document.documentElement.classList.toggle('role-bm', bm);

  const roleLabel = document.getElementById('currentUserRoleLabel');
  if (roleLabel) roleLabel.textContent = bm ? `Boutique Manager · ${user.shop?.name || 'no shop'}` : 'Signed in as';

  for (const id of ['navWishlist', 'navCommissions']) {
    const el = document.getElementById(id);
    if (el) { el.classList.toggle('hidden', !bm); el.classList.toggle('flex', bm); }
  }

  if (!bm) return;

  // Copy that talks about "the book" / "all clients" → this shop
  const vaultSub = document.querySelector('#page-dashboard h2 + p');
  if (vaultSub) vaultSub.textContent = `Pieces, wishlist and commission at ${bmShopName()}.`;
  const watchesSub = document.getElementById('watchesSubtitle');
  if (watchesSub) watchesSub.textContent = `Every piece registered at ${bmShopName()}.`;

  // Keyboard shortcuts: only the pages a boutique manager has
  ['p', 'k', 'c', 'b', 'd', 'm', ','].forEach(k => delete GOTO_KEYS[k]);
  newItemForPage = function () {};   // "n" creates nothing

  if (!QUICK_FILTERS.some(f => f.id === 'handedMonth')) {
    for (let i = QUICK_FILTERS.length - 1; i >= 0; i--) if (BM_DROP_QUICK_FILTERS.includes(QUICK_FILTERS[i].id)) QUICK_FILTERS.splice(i, 1);
    QUICK_FILTERS.push(...BM_QUICK_FILTERS);
  }

  // Watches status tabs: All · Wishlist · Handed over (Purchased / Sold are
  // hidden by style.css, since setWatchStatusTab rewrites the tabs' classes)
  const tabs = document.getElementById('watchStatusTabs');
  if (tabs && !tabs.querySelector('[data-status="handed_over"]')) {
    const t = document.createElement('button');
    t.dataset.status = 'handed_over';
    t.className = 'watch-status-tab text-[11px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-lg border transition-all border-outline-variant/30 text-on-surface-variant hover:bg-surface-variant/30';
    t.textContent = 'Handed over';
    tabs.appendChild(t);
  }
}

// ── Navigation ─────────────────────────────────────────────────────────────

// Pages a boutique manager cannot open fall back to the Vault
const _bmShowPage = showPage;
showPage = function (name) {
  if (isBoutiqueManager() && !BM_PAGES.includes(name)) name = 'dashboard';
  _bmShowPage(name);
  if (isBoutiqueManager()) syncBmNav(name);
};

// Watches vs Wishlist: both are the Watches page, the nav shows which tab is on
function syncBmNav(page) {
  const wishlistOn = page === 'watches' && watchStatusFilter === 'wishlist';
  const set = (el, on) => { if (!el) return; el.classList.toggle('nav-active', on); el.classList.toggle('nav-inactive', !on); };
  set(document.getElementById('navWishlist'), wishlistOn);
  set(document.querySelector('.nav-item[data-page="watches"]'), page === 'watches' && !wishlistOn);
}
const _bmSetWatchStatusTab = setWatchStatusTab;
setWatchStatusTab = function (status) {
  _bmSetWatchStatusTab(status);
  if (isBoutiqueManager() && currentPage === 'watches') syncBmNav('watches');
};

function openBoutiqueWishlist() {
  activeQuickFilter = null;
  setWatchStatusTab('wishlist');
  const search = document.getElementById('watchSearch');
  search.value = ''; search.dataset.typed = '';
  showPage('watches');
}
document.getElementById('navWishlist')?.addEventListener('click', openBoutiqueWishlist);
// The Watches nav item always opens the "All" tab for a boutique manager
document.addEventListener('click', e => {
  if (!isBoutiqueManager()) return;
  if (e.target.closest('.nav-item[data-page="watches"]')) { activeQuickFilter = null; _bmSetWatchStatusTab(''); }
}, true);

// Watches filtered to one client (the Vault's client list links here)
function openWatchesForClient(name) {
  activeQuickFilter = null;
  setWatchStatusTab('');
  const search = document.getElementById('watchSearch');
  search.value = name; search.dataset.typed = name;
  showPage('watches');
}

// ── Series helpers ─────────────────────────────────────────────────────────

// Commission per month in the currency most commission was paid in
function bmCommissionSeries(watches, n = 12) {
  const entries = watches.flatMap(w => w.expenses || []);
  const byCur = {};
  for (const e of entries) byCur[e.currency || 'CHF'] = (byCur[e.currency || 'CHF'] || 0) + Number(e.amount || 0);
  const cur = Object.entries(byCur).sort((a, b) => b[1] - a[1])[0]?.[0] || 'CHF';
  return { cur, values: monthlySeries(entries.filter(e => (e.currency || 'CHF') === cur), e => e.date, e => e.amount, n) };
}
function bmCommissionThisMonth(watches) {
  const m = {};
  for (const w of watches) for (const e of (w.expenses || [])) {
    if (isThisMonth(e.date)) m[e.currency || 'CHF'] = (m[e.currency || 'CHF'] || 0) + Number(e.amount || 0);
  }
  return m;
}
const bmThumb = w => `<div class="w-9 h-9 rounded-md bg-surface-container border border-outline-variant/15 flex items-center justify-center flex-shrink-0 overflow-hidden">
  ${w.image_path ? `<img src="${w.image_path}" alt="" class="w-full h-full object-cover">` : '<span class="material-symbols-outlined text-outline text-[18px]">watch</span>'}</div>`;
const bmCommissionHtml = (w, cls = 'text-xs') => w.commission != null
  ? `<span class="font-mono ${cls} bm-commission">${fmt.price(w.commission, w.commission_currency || w.currency || 'CHF')}</span>`
  : `<span class="${cls} text-outline">—</span>`;

// ── Vault ──────────────────────────────────────────────────────────────────

const _bmLoadDashboard = loadDashboard;
loadDashboard = async function () {
  if (!isBoutiqueManager()) return _bmLoadDashboard();

  const shop = currentUser.shop;
  const [stats, watches, shops, profiles] = await Promise.all([
    api('GET', '/api/stats'),
    api('GET', '/api/watches'),
    api('GET', '/api/shops'),
    api('GET', '/api/profiles'),
  ]);
  watches.forEach(w => { watchCache[w.id] = w; });
  const count = fn => watches.filter(fn).length;
  const quick = id => QUICK_FILTERS.find(f => f.id === id).test;

  // ── Needs attention ──
  const commMonth = bmCommissionThisMonth(watches);
  const items = [
    { n: count(quick('waiting30')),   tone: 'amber',  icon: 'hourglass_top', title: 'Wishlist waiting 30+ days', cta: 'Review list',     go: "openWatchesWithQuickFilter('waiting30')" },
    { n: count(quick('handedMonth')), tone: 'cyan',   icon: 'handshake',     title: 'Handed over this month',    cta: 'See pieces',      go: "openWatchesWithQuickFilter('handedMonth')" },
    { money: commMonth,               tone: 'green',  icon: 'payments',      title: 'Commission this month',     cta: 'See commissions', go: "showPage('commissions')" },
  ].filter(it => it.money ? Object.keys(it.money).length : it.n > 0);
  document.getElementById('vaultAttention').innerHTML = items.length
    ? items.map(it => `
      <button type="button" class="attention-card tone-${it.tone}" onclick="${it.go}">
        <span class="attention-icon material-symbols-outlined">${it.icon}</span>
        <span class="min-w-0 flex-1 text-left">
          <span class="attention-title">${esc(it.title)}</span>
          <span class="attention-value">${it.money ? fmt.byCurrency(it.money) : `${it.n}<span class="attention-unit">${it.n === 1 ? 'watch' : 'watches'}</span>`}</span>
          <span class="attention-cta">${esc(it.cta)} →</span>
        </span>
      </button>`).join('')
    : `<div class="attention-card tone-green col-span-full">
        <span class="attention-icon material-symbols-outlined">task_alt</span>
        <span><span class="attention-title">All clear</span><span class="attention-value text-base">Nothing needs your attention right now.</span></span>
      </div>`;

  // ── At a glance (shop figures — no P&L, no sale proceeds) ──
  const vs   = vaultSeries(watches, 12);
  const comm = bmCommissionSeries(watches, 12);
  const longest = watches.filter(w => w.status === 'wishlist').reduce((mx, w) => Math.max(mx, wishlistDays(w) ?? 0), 0);
  const tile = (label, value, sub, spark) => `
    <article class="glass-surface rounded-lg p-5">
      <p class="text-[11px] uppercase tracking-[0.06em] text-on-surface-variant font-semibold mb-2">${label}</p>
      <div class="font-playfair text-2xl text-on-surface leading-tight">${value}</div>
      <p class="text-xs text-on-surface-variant mt-1">${sub}</p>
      ${spark}
    </article>`;
  const pcs = n => `<span class="text-sm text-on-surface-variant font-sans font-medium ml-1">${n === 1 ? 'piece' : 'pieces'}</span>`;
  document.getElementById('vaultTiles').innerHTML = [
    tile(`Pieces at ${esc(shop?.name || 'the shop')}`, `${stats.total_watches}${pcs(stats.total_watches)}`, `${stats.handed_over_count} handed over · ${stats.wishlist_count} on the wishlist`,
         sparkBlock(vs.boughtCount, { color: SPARK.cyan, caption: 'pieces handed over / month', label: 'Pieces handed over per month' })),
    tile('Wishlist', `${stats.wishlist_count}${pcs(stats.wishlist_count)}`, stats.wishlist_count ? `longest wait ${longest} day${longest !== 1 ? 's' : ''}` : 'nothing waiting',
         sparkBlock(vs.wishAdds, { color: SPARK.amber, caption: 'wishlist adds / month', label: 'Wishlist adds per month' })),
    tile('Handed over', fmt.byCurrency(stats.handed_over_list_value), `${stats.handed_over_count} piece${stats.handed_over_count !== 1 ? 's' : ''} at list price`,
         sparkBlock(vs.boughtValue, { color: SPARK.violet, caption: `value handed over / month · ${vs.cur}`, label: 'Value handed over per month' })),
    tile('Commission', fmt.byCurrency(stats.commission_total), `${stats.commission_pieces} piece${stats.commission_pieces !== 1 ? 's' : ''} with commission`,
         sparkBlock(comm.values, { color: SPARK.green, caption: `commission / month · ${comm.cur}`, label: 'Commission per month' })),
  ].join('');

  // ── Longest waiting ──
  const waiting = watches.filter(w => w.status === 'wishlist')
    .sort((a, b) => (wishlistDays(b) ?? -1) - (wishlistDays(a) ?? -1)).slice(0, 6);
  document.getElementById('vaultWaiting').innerHTML = waiting.length ? waiting.map(w => {
    const d = wishlistDays(w) ?? 0;
    const urgency = d >= 30 ? 'text-error' : d >= 14 ? 'text-amber-400' : 'text-on-surface-variant';
    return `
    <button type="button" class="tbl-row w-full px-5 py-2.5 flex items-center gap-3 text-left" onclick="openWatchDetail(${w.id})">
      ${bmThumb(w)}
      <span class="flex-1 min-w-0">
        <span class="block text-sm font-medium text-on-surface truncate">${esc(w.model)}</span>
        <span class="block text-xs text-on-surface-variant truncate">${esc(w.client_name || '—')}${w.reference_number ? ` · <span class="font-mono">${esc(w.reference_number)}</span>` : ''}</span>
      </span>
      <span class="font-mono text-lg font-semibold leading-none ${urgency}">${d}<span class="text-xs font-sans font-medium text-outline ml-1">${d === 1 ? 'day' : 'days'}</span></span>
    </button>`;
  }).join('') : `<p class="px-5 py-10 text-center text-sm text-on-surface-variant">Nothing on the wishlist.</p>`;

  // ── Recently handed over (replaces "Recent sales") ──
  const salesPanel = document.getElementById('vaultSales');
  const header = salesPanel.previousElementSibling;
  const h3 = header?.querySelector('h3');
  if (h3) h3.innerHTML = `<span class="material-symbols-outlined text-primary text-[18px]">handshake</span>Recently handed over`;
  const link = header?.querySelector('button');
  if (link) { link.textContent = 'Handed over this month →'; link.setAttribute('onclick', "openWatchesWithQuickFilter('handedMonth')"); }
  const bought = sortByKey(watches.filter(w => w.status === 'handed_over'), w => w.purchase_date || (w.created_at || '').slice(0, 10), 'desc').slice(0, 6);
  salesPanel.innerHTML = bought.length ? bought.map(w => `
    <button type="button" class="tbl-row w-full px-5 py-2.5 flex items-center gap-3 text-left" onclick="openWatchDetail(${w.id})">
      ${bmThumb(w)}
      <span class="flex-1 min-w-0">
        <span class="block text-sm font-medium text-on-surface truncate">${esc(w.model)}</span>
        <span class="block text-xs text-on-surface-variant truncate">${esc(w.client_name || '—')} · <span class="font-mono">${fmt.date(w.purchase_date)}</span></span>
      </span>
      <span class="text-right flex-shrink-0">
        <span class="block font-mono text-sm font-semibold text-on-surface">${w.list_price != null ? fmt.price(w.list_price, w.currency || 'CHF') : '—'}</span>
        <span class="block text-[11px] text-outline">commission ${bmCommissionHtml(w, 'text-[11px]')}</span>
      </span>
    </button>`).join('') : `<p class="px-5 py-10 text-center text-sm text-on-surface-variant">Nothing handed over yet.</p>`;

  document.getElementById('vaultUpdated').textContent = 'Updated ' + new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  // ── Registry line + tables ──
  document.getElementById('s-shops').textContent   = shops.length.toLocaleString();
  document.getElementById('s-clients').textContent = profiles.length.toLocaleString();
  document.getElementById('s-clients-sub').textContent = `${watches.length.toLocaleString()} piece${watches.length !== 1 ? 's' : ''} at ${shop?.name || 'the shop'}`;

  const portfoliosPerShop = await Promise.all(shops.map(s => api('GET', `/api/portfolios?shop_id=${s.id}`)));
  document.getElementById('recentShops').innerHTML = shops.length ? shops.map((s, i) => `
    <tr class="tbl-row cursor-pointer" onclick="openShopDetail(${s.id})">
      <td class="px-5 py-3">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <span class="material-symbols-outlined text-primary text-[18px]">store</span>
          </div>
          <span class="text-on-surface font-medium text-sm">${esc(s.name)}</span>
        </div>
      </td>
      <td class="px-5 py-3 text-on-surface-variant text-xs whitespace-pre-line leading-relaxed">${esc(s.address || '—')}</td>
      <td class="px-5 py-3 text-on-surface-variant text-sm">${portfoliosPerShop[i].length} portfolio${portfoliosPerShop[i].length !== 1 ? 's' : ''}</td>
      <td class="px-5 py-3 text-right">
        <button onclick="event.stopPropagation(); openShopDetail(${s.id})" class="text-[11px] font-semibold uppercase tracking-wider text-primary hover:underline px-3 py-1 border border-transparent hover:border-primary/20 rounded transition-all">View</button>
      </td>
    </tr>`).join('') : `<tr><td colspan="4" class="px-6 py-16 text-center text-on-surface-variant text-sm">No shop assigned to this account yet — ask the registry owner.</td></tr>`;

  // Clients of this shop (the column headers are reused: Client / Patek ID / Portfolio / Watches)
  const clientsTable = document.getElementById('recentClients').closest('table');
  const ths = clientsTable.querySelectorAll('thead th');
  if (ths[1]) ths[1].textContent = 'Patek ID';
  if (ths[2]) ths[2].textContent = 'Portfolio';
  const sorted = [...profiles].sort((a, b) => (b.watch_count || 0) - (a.watch_count || 0));
  document.getElementById('recentClients').innerHTML = sorted.length ? sorted.map(p => `
    <tr class="tbl-row cursor-pointer" onclick="openWatchesForClient('${esc(p.name).replace(/'/g, "\\'")}')">
      <td class="px-5 py-3">
        <div class="flex items-center gap-3">
          ${avatarHtml(p.name, p.photo_path, 'sm')}
          <span class="text-on-surface font-medium text-sm">${esc(p.name)}</span>
        </div>
      </td>
      <td class="px-5 py-3 text-on-surface-variant text-xs font-mono">${esc(p.pp_urn || p.subscriber_id || '—')}</td>
      <td class="px-5 py-3 text-on-surface-variant text-sm">${esc(p.portfolio_name || 'Individual')}</td>
      <td class="px-5 py-3 text-on-surface-variant text-sm">${p.watch_count || 0} watch${(p.watch_count || 0) !== 1 ? 'es' : ''}</td>
      <td class="px-5 py-3 text-right">
        <span class="text-[11px] font-semibold uppercase tracking-wider text-primary px-3 py-1">Pieces →</span>
      </td>
    </tr>`).join('') : `<tr><td colspan="5" class="px-6 py-16 text-center text-on-surface-variant text-sm">No clients at this shop yet.</td></tr>`;
  reapplyDomSort(document.getElementById('recentShops').closest('table'));
  reapplyDomSort(clientsTable);
};

// ── Commissions page (Tools → Commissions) ─────────────────────────────────
// Every commission the owner chose to share, newest first, grouped by month.
// The data is the same `expenses` list the watches already carry.

async function loadCommissions() {
  const body = document.getElementById('commissionsBody');
  if (!isBoutiqueManager()) {
    document.getElementById('commissionTiles').innerHTML = '';
    body.innerHTML = `<tr><td colspan="6" class="px-6 py-16 text-center text-on-surface-variant text-sm">This page is for boutique manager accounts.</td></tr>`;
    return;
  }
  document.getElementById('commissionsSubtitle').textContent = `Commission set for you on pieces at ${bmShopName()}. Your registry owner chooses which commissions appear here.`;
  const watches = await api('GET', '/api/watches');
  watches.forEach(w => { watchCache[w.id] = w; });
  const entries = watches.flatMap(w => (w.expenses || []).map(e => ({ ...e, watch: w })))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.id - a.id);

  // Tiles: all time, this month, pieces
  const sum = list => { const m = {}; for (const e of list) m[e.currency || 'CHF'] = (m[e.currency || 'CHF'] || 0) + Number(e.amount || 0); return m; };
  const total = sum(entries), month = sum(entries.filter(e => isThisMonth(e.date)));
  const pieces = new Set(entries.map(e => e.watch.id)).size;
  const monthName = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const tile = (label, value, sub) => `
    <div class="glass-surface rounded-lg p-5">
      <p class="text-[11px] uppercase tracking-[0.06em] text-on-surface-variant font-semibold mb-3">${label}</p>
      <p class="font-playfair text-2xl bm-commission">${value}</p>
      <p class="text-[11px] text-on-surface-variant mt-1">${sub}</p>
    </div>`;
  document.getElementById('commissionTiles').innerHTML = [
    tile('Total commission', fmt.byCurrency(total), `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} shared with you`),
    tile(`This month`, fmt.byCurrency(month), monthName),
    tile('Pieces with commission', `<span class="text-on-surface">${pieces}</span>`, `of ${watches.length} piece${watches.length !== 1 ? 's' : ''} at ${bmShopName()}`),
  ].join('');
  document.getElementById('commissionsCount').textContent = entries.length ? `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}` : '';
  document.getElementById('commissionsUpdated').textContent = 'Updated ' + new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  if (!entries.length) {
    body.innerHTML = `<tr><td colspan="6" class="px-6 py-16 text-center text-on-surface-variant text-sm">
      <span class="material-symbols-outlined text-outline text-3xl block mb-2">payments</span>
      No commissions shared with you yet. Your registry owner marks a commission as visible to the boutique when recording it on a watch.</td></tr>`;
    return;
  }

  // Month group header rows with the month's total, then the entries
  let lastMonth = null, html = '';
  for (const e of entries) {
    const key = (e.date || '').slice(0, 7);
    if (key !== lastMonth) {
      lastMonth = key;
      const inMonth = entries.filter(x => (x.date || '').slice(0, 7) === key);
      const label = key ? new Date(key + '-01T00:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : 'Undated';
      html += `<tr class="wl-group-row"><td colspan="6" class="!py-2 !px-5"><span class="text-[11px] font-semibold uppercase tracking-[0.06em] text-on-surface-variant">${label}</span>
        <span class="font-mono text-xs bm-commission ml-3">${fmt.byCurrency(sum(inMonth))}</span></td></tr>`;
    }
    const w = e.watch;
    html += `
      <tr class="tbl-row cursor-pointer" onclick="openWatchDetail(${w.id})">
        <td class="px-5 py-3 text-xs font-mono text-on-surface-variant whitespace-nowrap">${fmt.date(e.date)}</td>
        <td class="px-5 py-3">
          <div class="flex items-center gap-3 min-w-0">
            ${bmThumb(w)}
            <div class="min-w-0">
              <p class="text-sm font-medium text-on-surface truncate">${esc(w.model)}</p>
              <p class="text-xs font-mono text-outline truncate">${esc(w.reference_number || '')}${w.serial_number ? ` · ${esc(w.serial_number)}` : ''}</p>
            </div>
          </div>
        </td>
        <td class="px-5 py-3 text-sm text-on-surface-variant">${esc(w.client_name || '—')}</td>
        <td class="px-5 py-3">${statusBadge(w.status)}</td>
        <td class="px-5 py-3 text-sm text-on-surface-variant max-w-[320px] truncate">${esc(e.description || '—')}</td>
        <td class="px-5 py-3 text-right font-mono text-sm font-semibold bm-commission whitespace-nowrap">${fmt.price(e.amount, e.currency || w.currency || 'CHF')}</td>
      </tr>`;
  }
  body.innerHTML = html;
}

// ── Watches page ───────────────────────────────────────────────────────────

const _bmLoadWatches = loadWatches;
loadWatches = async function (q, source) {
  if (!isBoutiqueManager()) return _bmLoadWatches(q, source);

  const stats = await api('GET', '/api/stats');
  const label = (id, text) => { const p = document.getElementById(id)?.parentElement?.querySelector('p'); if (p) p.textContent = text; };
  label('wv-value',    'Pieces');
  label('wv-active',   'Handed over');
  label('wv-proceeds', 'Wishlist');
  label('wv-pnl',      'Commission');
  document.getElementById('wv-value').innerHTML    = `${stats.total_watches}<span class="text-sm text-on-surface-variant font-sans font-medium ml-1">${stats.total_watches === 1 ? 'piece' : 'pieces'}</span>`;
  document.getElementById('wv-active').innerHTML   = fmt.byCurrency(stats.handed_over_list_value);
  document.getElementById('wv-proceeds').innerHTML = `${stats.wishlist_count}<span class="text-sm text-on-surface-variant font-sans font-medium ml-1">${stats.wishlist_count === 1 ? 'piece' : 'pieces'}</span>`;
  document.getElementById('wv-pnl').innerHTML      = `<span class="bm-commission">${fmt.byCurrency(stats.commission_total)}</span>`;
  document.getElementById('wv-value-sub').textContent    = `at ${bmShopName()}`;
  document.getElementById('wv-active-sub').textContent   = `${stats.handed_over_count} piece${stats.handed_over_count !== 1 ? 's' : ''} · list price`;
  document.getElementById('wv-proceeds-sub').textContent = `${stats.wishlist_count} waiting`;
  document.getElementById('wv-pnl-sub').textContent      = `${stats.commission_pieces} piece${stats.commission_pieces !== 1 ? 's' : ''} with commission`;
  document.getElementById('wv-total').textContent = stats.total_watches.toLocaleString();

  const params = new URLSearchParams();
  if (q) params.set('q', q);
  allWatches = await api('GET', `/api/watches?${params}`);
  allWatches.forEach(w => { watchCache[w.id] = w; });
  if (!q) renderWatchSparklines(allWatches);
  watchPage = 1;
  renderWatches();
  renderWishlistWaiting();
};

const _bmRenderWatchSparklines = renderWatchSparklines;
renderWatchSparklines = function (watches) {
  if (!isBoutiqueManager()) return _bmRenderWatchSparklines(watches);
  const vs = vaultSeries(watches, 12);
  const comm = bmCommissionSeries(watches, 12);
  document.getElementById('wv-value-spark').innerHTML    = sparkBlock(vs.boughtCount, { color: SPARK.cyan,   caption: 'pieces handed over / month', label: 'Pieces handed over per month' });
  document.getElementById('wv-active-spark').innerHTML   = sparkBlock(vs.boughtValue, { color: SPARK.violet, caption: `value handed over / month · ${vs.cur}`, label: 'Value handed over per month' });
  document.getElementById('wv-proceeds-spark').innerHTML = sparkBlock(vs.wishAdds,    { color: SPARK.amber,  caption: 'wishlist adds / month', label: 'Wishlist adds per month' });
  document.getElementById('wv-pnl-spark').innerHTML      = sparkBlock(comm.values,    { color: SPARK.green,  caption: `commission / month · ${comm.cur}`, label: 'Commission per month' });
};

// ── Watch page ─────────────────────────────────────────────────────────────
// A plain page: the piece, its identity, the commission on it and the client.

const _bmRenderWatchDetailPage = renderWatchDetailPage;
renderWatchDetailPage = function (w) {
  if (!isBoutiqueManager()) return _bmRenderWatchDetailPage(w);

  const cur = w.currency || 'CHF';
  const pr  = w.profile || {};
  const stCls = { wishlist:    'text-amber-400 border-amber-400/30 bg-amber-400/5',
                  handed_over: 'text-primary border-primary/30 bg-primary/5' };
  const stLabel = { wishlist: 'Wishlist', handed_over: 'Handed over' };
  const field = (label, val, mono) => val != null && val !== '' && val !== '—' ? `<div>
      <p class="text-[11px] uppercase tracking-wider text-on-surface-variant mb-0.5">${label}</p>
      <p class="text-sm text-on-surface ${mono ? 'font-mono' : ''}">${esc(String(val))}</p>
    </div>` : '';
  const card = (title, body) => `
    <div class="glass-surface rounded-xl p-6 border border-outline-variant/10">
      <p class="text-[11px] uppercase tracking-[0.06em] font-semibold text-on-surface-variant mb-4">${title}</p>
      ${body}
    </div>`;
  const waiting = w.status === 'wishlist' ? wishlistDays(w) : null;
  const entries = (w.expenses || []);
  const commissionRows = entries.length
    ? entries.map(e => `
      <div class="flex items-center gap-3 py-2.5 border-b border-outline-variant/10 last:border-0">
        <span class="text-xs font-mono text-on-surface-variant w-24 flex-shrink-0">${fmt.date(e.date)}</span>
        <span class="flex-1 text-sm text-on-surface-variant truncate">${esc(e.description || 'Commission')}</span>
        <span class="font-mono text-sm bm-commission flex-shrink-0">${fmt.price(e.amount, e.currency || cur)}</span>
      </div>`).join('')
    : `<p class="text-sm text-on-surface-variant/50 italic py-2">No commission recorded on this piece yet.</p>`;

  document.getElementById('watchDetailContent').innerHTML = `
    <div class="glass-surface rounded-xl overflow-hidden">
      <div class="flex items-start gap-6 p-6">
        <div class="w-32 h-32 rounded-lg bg-surface-container border border-outline-variant/15 flex items-center justify-center flex-shrink-0 overflow-hidden ${w.image_path ? 'cursor-zoom-in' : ''}"
             ${w.image_path ? `onclick="openLightbox('${w.image_path}')"` : ''}>
          ${w.image_path ? `<img src="${w.image_path}" class="w-full h-full object-cover" alt="${esc(w.model)}">`
                         : `<span class="material-symbols-outlined text-outline text-4xl">watch</span>`}
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap mb-2">
            <span class="text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-lg border ${stCls[w.status] || stCls.handed_over} inline-block">${stLabel[w.status] || 'Handed over'}</span>
            ${waiting != null ? `<span class="text-[11px] font-mono ${waiting >= 30 ? 'text-error' : waiting >= 14 ? 'text-amber-400' : 'text-on-surface-variant'}">${waiting} day${waiting !== 1 ? 's' : ''} waiting</span>` : ''}
            <span class="bm-badge ml-auto"><span class="material-symbols-outlined text-[14px]">visibility</span> Boutique view</span>
          </div>
          <h1 class="font-playfair text-3xl font-semibold text-on-surface leading-tight">${esc(w.model)}</h1>
          <p class="text-on-surface-variant text-sm mt-1.5">
            ${w.shop_name ? `${esc(w.shop_name)} · ` : ''}${esc(w.client_name || pr.name || '—')}${w.reference_number ? ` · <span class="font-mono">${esc(w.reference_number)}</span>` : ''}
          </p>
          <div class="grid grid-cols-3 gap-4 text-sm mt-5 max-w-xl">
            <div class="bg-white/[0.02] rounded-lg p-3.5">
              <p class="text-[11px] uppercase tracking-wider text-on-surface-variant mb-1">List Price</p>
              <p class="font-playfair text-lg text-on-surface font-mono">${w.list_price != null ? fmt.price(w.list_price, cur) : '<span class="text-outline">—</span>'}</p>
            </div>
            <div class="bg-white/[0.02] rounded-lg p-3.5">
              <p class="text-[11px] uppercase tracking-wider text-on-surface-variant mb-1">${w.status === 'wishlist' ? 'On wishlist since' : 'Handed over'}</p>
              <p class="font-playfair text-lg text-on-surface font-mono">${w.status === 'wishlist' ? fmt.date((w.created_at || '').slice(0, 10)) : fmt.date(w.purchase_date)}</p>
            </div>
            <div class="bg-white/[0.02] rounded-lg p-3.5">
              <p class="text-[11px] uppercase tracking-wider text-on-surface-variant mb-1">Commission</p>
              <p class="font-playfair text-lg font-mono">${bmCommissionHtml(w, 'text-lg')}</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div class="lg:col-span-2 space-y-6">
        ${card('Commission on this piece', commissionRows)}
        ${w.notes ? card('Notes', `<p class="text-sm text-on-surface leading-relaxed">${esc(w.notes)}</p>`) : ''}
      </div>
      <div class="space-y-6">
        ${card('Watch Identity', `<div class="grid grid-cols-2 gap-x-6 gap-y-4">${[
          field('Reference No.', w.reference_number, true),
          field('Serial No.',    w.serial_number,    true),
          field('Movement No.',  w.movement_number,  true),
          field('Case No.',      w.case_number,      true),
          field('Source',        w.source),
          field('Currency',      w.currency),
        ].filter(Boolean).join('')}</div>`)}
        ${pr.name ? card('Client', `
          <div class="flex items-center gap-4">
            ${avatarHtml(pr.name, pr.photo_path, 'md')}
            <div class="min-w-0">
              <p class="font-semibold text-on-surface truncate">${esc(pr.name)}</p>
              ${pr.email ? `<p class="text-xs text-on-surface-variant mt-0.5 truncate">${esc(pr.email)}</p>` : ''}
              ${pr.pp_urn ? `<p class="text-xs font-mono text-on-surface-variant mt-0.5">${esc(pr.pp_urn)}</p>` : ''}
              ${pr.portfolio_name ? `<p class="text-xs text-outline mt-0.5">${esc(pr.portfolio_name)}</p>` : ''}
            </div>
          </div>`) : ''}
      </div>
    </div>`;
};
