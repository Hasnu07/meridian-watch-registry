// 19-vault.js — Vault (home) overview: what needs attention, KPIs with trends,
// longest-waiting wishlist and recent sales
// Part of the dashboard script: scripts/build.js concatenates src/dashboard/*.js
// in filename order into public/js/dashboard.js (one classic script, so
// functions and top-level variables stay shared exactly as before).

// Open Watches with a quick filter already applied (used by the Vault links)
function openWatchesWithQuickFilter(id) {
  activeQuickFilter = { id };
  setWatchStatusTab('');
  const search = document.getElementById('watchSearch');
  search.value = ''; search.dataset.typed = '';
  showPage('watches');
}

async function loadVaultInsights() {
  const [stats, watches, profiles] = await Promise.all([
    api('GET', '/api/stats'),
    api('GET', '/api/watches'),
    api('GET', '/api/profiles'),
  ]);
  watches.forEach(w => { watchCache[w.id] = w; });
  const profileById = Object.fromEntries(profiles.map(p => [p.id, p]));

  // Money still to be paid out, per currency (never mix currencies)
  const owedToMe = {}, owedToClients = {};
  for (const w of watches) {
    if (w.status === 'wishlist') continue;
    const enriched = { ...w, profile: profileById[w.profile_id] };
    const cur = w.currency || 'CHF';
    const my = Math.max(0, watchPayoutBalance(enriched, 'my').remaining);
    const cl = Math.max(0, watchPayoutBalance(enriched, 'client').remaining);
    if (my > 0.5) owedToMe[cur] = (owedToMe[cur] || 0) + my;
    if (cl > 0.5) owedToClients[cur] = (owedToClients[cur] || 0) + cl;
  }
  const count = fn => watches.filter(fn).length;
  const quick = id => QUICK_FILTERS.find(f => f.id === id).test;

  // ── Needs attention: only items that actually need something ──
  const items = [
    { n: count(quick('waiting30')), tone: 'amber',  icon: 'hourglass_top',  title: 'Wishlist waiting 30+ days', cta: 'Review list', go: "openWatchesWithQuickFilter('waiting30')" },
    { money: owedToMe,              tone: 'amber',  icon: 'account_balance_wallet', title: 'Still to withdraw (mine)', cta: 'See payouts', go: "showPage('main-kpi')" },
    { money: owedToClients,         tone: 'violet', icon: 'outbound',       title: 'Still owed to clients', cta: 'See payouts', go: "showPage('main-kpi')" },
    { n: count(quick('held60')),    tone: 'cyan',   icon: 'inventory_2',    title: 'Bought, unsold 60+ days', cta: 'Review stock', go: "openWatchesWithQuickFilter('held60')" },
    { n: count(quick('noPrice')),   tone: 'cyan',   icon: 'money_off',      title: 'Watches without a price', cta: 'Add prices', go: "openWatchesWithQuickFilter('noPrice')" },
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

  // ── At a glance: four KPI tiles with 12-month trend lines ──
  const t = watchTrendSeries(watches);
  const longest = watches.filter(w => w.status === 'wishlist').reduce((mx, w) => Math.max(mx, wishlistDays(w) ?? 0), 0);
  const pnlTotal = t.pnl.reduce((a, b) => a + b, 0);
  // Each tile opens a detailed, interactive chart (22-vault-charts.js)
  const tile = (key, label, value, sub, spark) => `
    <article class="vault-tile glass-surface rounded-lg p-5" data-tile="${key}" role="button" tabindex="0" aria-expanded="false" aria-label="Open the ${label.replace('&amp;', 'and')} chart" style="view-transition-name: vt-${key}">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="text-[11px] uppercase tracking-[0.06em] text-on-surface-variant font-semibold mb-2">${label}</p>
          <div class="font-playfair text-2xl text-on-surface leading-tight">${value}</div>
          <p class="text-xs text-on-surface-variant mt-1">${sub}</p>
        </div>
        <span class="vault-tile-open material-symbols-outlined" aria-hidden="true">open_in_full</span>
        <button type="button" class="vault-tile-close" data-close-chart aria-label="Close chart" title="Close (Esc)"><span class="material-symbols-outlined">close</span></button>
      </div>
      <div class="vault-tile-spark">${spark}</div>
      <div class="vault-detail"></div>
    </article>`;
  document.getElementById('vaultTiles').innerHTML = [
    tile('pnl', 'Realised P&amp;L', fmt.byCurrency(stats.net_pnl, { signed: true, colour: true }), `${stats.sold_count} sold · sale − list price`,
         sparkBlock(t.pnl, { color: pnlTotal >= 0 ? SPARK.green : SPARK.red, caption: `P&L / month · ${t.currency}`, label: 'Profit and loss per month' })),
    tile('sales', 'Sales', fmt.byCurrency(stats.total_sale_value), `${stats.sold_count} piece${stats.sold_count !== 1 ? 's' : ''} sold`,
         sparkBlock(t.soldCount, { color: SPARK.pink, caption: 'pieces sold / month', label: 'Pieces sold per month' })),
    tile('inventory', 'Active inventory', fmt.byCurrency(stats.active_list_value), `${stats.purchased_count} bought, not yet sold`,
         sparkBlock(t.bought, { color: SPARK.violet, caption: 'pieces bought / month', label: 'Pieces bought per month' })),
    tile('wishlist', 'Wishlist', `${stats.wishlist_count}<span class="text-sm text-on-surface-variant font-sans font-medium ml-1">pieces</span>`, stats.wishlist_count ? `longest wait ${longest} day${longest !== 1 ? 's' : ''}` : 'nothing waiting',
         sparkBlock(t.wishAdds, { color: SPARK.amber, caption: 'added to wishlist / month', label: 'Watches added to the wishlist per month' })),
  ].join('');
  _vaultData = { watches, stats };
  restoreVaultChart();             // keep an open chart open across refreshes

  // ── Longest waiting ──
  const waiting = watches.filter(w => w.status === 'wishlist')
    .sort((a, b) => (wishlistDays(b) ?? -1) - (wishlistDays(a) ?? -1)).slice(0, 6);
  const thumb = w => `<div class="w-9 h-9 rounded-md bg-surface-container border border-outline-variant/15 flex items-center justify-center flex-shrink-0 overflow-hidden">
      ${w.image_path ? `<img src="${w.image_path}" alt="" class="w-full h-full object-cover">` : '<span class="material-symbols-outlined text-outline text-[18px]">watch</span>'}</div>`;
  document.getElementById('vaultWaiting').innerHTML = waiting.length ? waiting.map(w => {
    const d = wishlistDays(w) ?? 0;
    const urgency = d >= 30 ? 'text-error' : d >= 14 ? 'text-amber-400' : 'text-on-surface-variant';
    return `
    <button type="button" class="tbl-row w-full px-5 py-2.5 flex items-center gap-3 text-left" onclick="openWatchDetail(${w.id})">
      ${thumb(w)}
      <span class="flex-1 min-w-0">
        <span class="block text-sm font-medium text-on-surface truncate">${esc(w.model)}</span>
        <span class="block text-xs text-on-surface-variant truncate">${esc(w.client_name || '—')}</span>
      </span>
      <span class="font-mono text-lg font-semibold leading-none ${urgency}">${d}<span class="text-xs font-sans font-medium text-outline ml-1">${d === 1 ? 'day' : 'days'}</span></span>
    </button>`;
  }).join('') : `<p class="px-5 py-10 text-center text-sm text-on-surface-variant">Nothing on the wishlist.</p>`;

  // ── Recent sales ──
  const sales = sortByKey(watches.filter(w => w.status === 'sold'), watchDate, 'desc').slice(0, 6);
  document.getElementById('vaultSales').innerHTML = sales.length ? sales.map(w => {
    const cur = w.currency || 'CHF';
    const pnl = watchPnl(w);
    return `
    <button type="button" class="tbl-row w-full px-5 py-2.5 flex items-center gap-3 text-left" onclick="openWatchDetail(${w.id})">
      ${thumb(w)}
      <span class="flex-1 min-w-0">
        <span class="block text-sm font-medium text-on-surface truncate">${esc(w.model)}</span>
        <span class="block text-xs text-on-surface-variant truncate">${esc(w.client_name || '—')} · <span class="font-mono">${fmt.date(watchDate(w))}</span></span>
      </span>
      <span class="text-right flex-shrink-0">
        <span class="block font-mono text-sm font-semibold text-on-surface">${w.sale_price != null ? fmt.price(w.sale_price, cur) : '—'}</span>
        ${pnl != null ? `<span class="block font-mono text-xs ${pnl >= 0 ? 'text-emerald-400' : 'text-error'}">${pnl > 0 ? '+' : ''}${fmt.price(pnl, cur)}</span>` : ''}
      </span>
    </button>`;
  }).join('') : `<p class="px-5 py-10 text-center text-sm text-on-surface-variant">No sales yet.</p>`;

  document.getElementById('vaultUpdated').textContent = 'Updated ' + new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
