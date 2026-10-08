// 03-main-kpi.js — Main KPI page
// Part of the dashboard script: scripts/build.js concatenates src/dashboard/*.js
// in filename order into public/js/dashboard.js (one classic script, so
// functions and top-level variables stay shared exactly as before).

// ── Main KPI ───────────────────────────────────────────────────────────────
// Shared P&L / capital maths for Main KPI and the Vault overview.
function computeKpiData(profiles, allWatches) {
  // Group watches by profile_id
  const watchMap = {};
  for (const w of allWatches) {
    if (!watchMap[w.profile_id]) watchMap[w.profile_id] = [];
    watchMap[w.profile_id].push(w);
  }

  // Compute per-profile P&L — handles both 'split' and 'discount' trading rules
  const profilePnls = profiles.map(prof => {
    const watches      = watchMap[prof.id] || [];
    const profitSplit  = prof.profit_split_me ?? 100;
    const lossSplit    = prof.loss_split_me   ?? 100;
    const isDiscount   = (prof.trading_rule || 'split') === 'discount';
    const discountSplit= prof.discount_split  ?? 0.08;
    let grossProfit = 0, grossLoss = 0, discountIncome = 0, clientProfitResidual = 0, splitNet = 0;
    for (const w of watches) {
      if (w.status !== 'sold' || w.list_price == null) continue;
      if (watchRule(w, prof) === 'discount') {
        if (w.sale_price == null && w.market_price == null) continue;
        // Discount Split v2: income = market − client price; losses are the client's
        const d = discountCalc(w, prof);
        discountIncome       += d.myIncome;
        clientProfitResidual += d.clientPnl;
        if (d.rawDiff > 0) grossProfit += d.rawDiff; else grossLoss += d.rawDiff;
      } else {
        if (w.sale_price == null) continue;
        const diff = w.sale_price - w.list_price;
        const hd   = splitHandoverDisc(w);
        if (diff + hd > 0) grossProfit += diff + hd; else grossLoss += diff + hd;
        splitNet += diff;
        discountIncome += hd;      // P/L handover: discount vs market is mine
      }
    }
    const netPnl = grossProfit + grossLoss;
    // P/L split on the split-rule watches + Discount-rule results
    const splitMe = splitNet >= 0 ? profitSplit : lossSplit;
    const myShare     = (splitMe / 100) * splitNet + discountIncome;
    const clientShare = ((100 - splitMe) / 100) * splitNet + clientProfitResidual;
    const totalExpenses = watches.reduce((s, w) =>
      s + (w.expenses || []).filter(ex => !ex.reversed).reduce((es, ex) => es + ex.amount, 0), 0);
    // Aggregate payout balances across this profile's watches (paid only — wishlist excluded)
    let clientRemaining = 0, myRemaining = 0;
    for (const w of watches.filter(x => x.status !== 'wishlist')) {
      const enriched = { ...w, profile: prof };
      clientRemaining += Math.max(0, watchPayoutBalance(enriched, 'client').remaining);
      myRemaining     += Math.max(0, watchPayoutBalance(enriched, 'my'    ).remaining);
    }
    return {
      ...prof,
      watches,
      isDiscount, profitSplit, lossSplit, discountSplit,
      grossProfit, grossLoss, discountIncome, netPnl,
      myShare, clientShare,
      soldCount:     watches.filter(w => w.status === 'sold').length,
      activeCount:   watches.filter(w => w.status === 'wishlist' || w.status === 'purchased').length,
      wishlistCount: watches.filter(w => w.status === 'wishlist').length,
      purchasedCount:watches.filter(w => w.status === 'purchased').length,
      capitalDeployed: (prof.my_capital || 0) + (prof.client_capital || 0),
      available:       (prof.my_remaining || 0) + (prof.client_remaining || 0),
      totalExpenses,
      clientRemaining, myRemaining,
    };
  });

  // Aggregate totals
  const totals = profilePnls.reduce((acc, p) => {
    acc.capitalDeployed += p.capitalDeployed;
    acc.available       += p.available;
    acc.soldCount       += p.soldCount;
    acc.activeCount     += p.activeCount;
    acc.grossProfit     += p.grossProfit;
    acc.grossLoss       += p.grossLoss;
    acc.myShare         += p.myShare;
    acc.clientShare     += p.clientShare;
    acc.totalExpenses   += p.totalExpenses;
    acc.clientRemaining += p.clientRemaining;
    acc.myRemaining     += p.myRemaining;
    return acc;
  }, { capitalDeployed:0, available:0, soldCount:0, activeCount:0, grossProfit:0, grossLoss:0, myShare:0, clientShare:0, totalExpenses:0, clientRemaining:0, myRemaining:0 });

  return { profilePnls, totals };
}

async function loadMainKpi() {
  // Fetch all profiles (has split rules + capital) and all watches in parallel
  const [profiles, allWatches] = await Promise.all([
    api('GET', '/api/profiles'),
    api('GET', '/api/watches'),
  ]);

  const { profilePnls, totals } = computeKpiData(profiles, allWatches);

  const m   = v => fmt.money(v);
  const sgn = v => v > 0 ? '+' : '';
  const cls = v => v >= 0 ? 'text-emerald-400' : 'text-error';

  // Top KPI tiles
  document.getElementById('kpiTiles').innerHTML = [
    { label: 'Capital Deployed', value: m(totals.capitalDeployed), sub: null },
    { label: 'Available',        value: m(totals.available),       sub: null },
    { label: 'Sold',             value: totals.soldCount,           sub: 'watches' },
    { label: 'Active',           value: totals.activeCount,         sub: 'watches' },
    { label: 'Gross Profit',     value: m(totals.grossProfit),      cls: totals.grossProfit >= 0 ? 'text-emerald-400' : 'text-error' },
    { label: 'Gross Loss',       value: m(totals.grossLoss),        cls: totals.grossLoss >= 0 ? 'text-emerald-400' : 'text-error' },
    { label: 'Total Expenses',   value: totals.totalExpenses > 0 ? m(totals.totalExpenses) : '—', cls: totals.totalExpenses > 0 ? 'text-sky-300' : 'text-on-surface-variant/40' },
    { label: 'Client Outstanding', value: totals.clientRemaining > 0 ? m(totals.clientRemaining) : '—', cls: totals.clientRemaining > 0 ? 'text-purple-300' : 'text-on-surface-variant/40', sub: totals.clientRemaining > 0 ? 'owed to clients' : 'settled' },
    { label: 'My Outstanding',     value: totals.myRemaining     > 0 ? m(totals.myRemaining)     : '—', cls: totals.myRemaining     > 0 ? 'text-amber-300'  : 'text-on-surface-variant/40', sub: totals.myRemaining     > 0 ? 'not yet withdrawn' : 'settled' },
  ].map(t => `
    <div class="glass-surface rounded-lg p-4">
      <p class="text-[11px] uppercase tracking-wider text-on-surface-variant mb-1.5">${t.label}</p>
      <p class="font-playfair text-2xl ${t.cls || 'text-on-surface'}">${t.value}</p>
      ${t.sub ? `<p class="text-[11px] text-on-surface-variant mt-0.5">${t.sub}</p>` : ''}
    </div>`).join('');

  // Net P&L bar
  const adjMyShare = totals.myShare - totals.totalExpenses;
  document.getElementById('kpiNetBar').innerHTML = `
    <div class="flex-1">
      <p class="text-[11px] uppercase tracking-[0.06em] font-semibold text-on-surface-variant mb-1">My Net P&amp;L</p>
      <p class="font-playfair text-3xl font-semibold ${cls(totals.myShare)}">${sgn(totals.myShare)}${m(totals.myShare)}</p>
      <p class="text-xs text-on-surface-variant mt-1">${sgn(totals.grossProfit)}${m(totals.grossProfit)} profit · ${sgn(totals.grossLoss)}${m(totals.grossLoss)} loss · applied across ${profiles.length} membership${profiles.length !== 1 ? 's' : ''}</p>
    </div>
    <div class="border-l border-outline-variant/15 pl-6">
      <p class="text-[11px] uppercase tracking-[0.06em] font-semibold text-on-surface-variant mb-1">Client Net P&amp;L</p>
      <p class="font-playfair text-3xl font-semibold ${cls(totals.clientShare)}">${sgn(totals.clientShare)}${m(totals.clientShare)}</p>
    </div>
    ${totals.totalExpenses > 0 ? `
    <div class="border-l border-sky-500/20 pl-6">
      <p class="text-[11px] uppercase tracking-[0.06em] font-semibold text-sky-400/70 mb-1">Adj. Net P&amp;L</p>
      <p class="font-playfair text-3xl font-semibold ${cls(adjMyShare)}">${sgn(adjMyShare)}${m(adjMyShare)}</p>
      <p class="text-xs text-sky-400/50 mt-1">after ${m(totals.totalExpenses)} expenses</p>
    </div>` : ''}`;

  // Per-shop breakdown
  const shopMap = {};
  for (const p of profilePnls) {
    const key   = p.shop_name || 'Unassigned';
    const shopId = p.shop_id || null;
    if (!shopMap[key]) shopMap[key] = { shopId, members:0, soldCount:0, activeCount:0, grossProfit:0, grossLoss:0, myShare:0, clientShare:0 };
    const s = shopMap[key];
    s.members++;
    s.soldCount   += p.soldCount;
    s.activeCount += p.activeCount;
    s.grossProfit  += p.grossProfit;
    s.grossLoss    += p.grossLoss;
    s.myShare      += p.myShare;
    s.clientShare  += p.clientShare;
  }
  document.getElementById('kpiShopTable').innerHTML = Object.entries(shopMap).length
    ? Object.entries(shopMap).map(([name, s]) => `
      <tr class="tbl-row cursor-pointer" onclick="${s.shopId ? `openShopDetail(${s.shopId})` : ''}">
        <td class="px-5 py-3 text-sm font-medium text-on-surface">${esc(name)}</td>
        <td class="px-5 py-3 text-sm text-on-surface-variant text-right">${s.members}</td>
        <td class="px-5 py-3 text-sm text-on-surface-variant text-right">${s.soldCount}</td>
        <td class="px-5 py-3 text-sm text-on-surface-variant text-right">${s.activeCount}</td>
        <td class="px-5 py-3 text-sm text-right ${s.grossProfit >= 0 ? 'text-emerald-400' : 'text-error'} font-medium">${sgn(s.grossProfit)}${m(s.grossProfit)}</td>
        <td class="px-5 py-3 text-sm text-right ${s.grossLoss >= 0 ? 'text-emerald-400' : 'text-error'} font-medium">${sgn(s.grossLoss)}${m(s.grossLoss)}</td>
        <td class="px-5 py-3 text-sm text-right ${cls(s.myShare)} font-semibold">${sgn(s.myShare)}${m(s.myShare)}</td>
        <td class="px-5 py-3 text-sm text-right ${cls(s.clientShare)} font-medium">${sgn(s.clientShare)}${m(s.clientShare)}</td>
      </tr>`).join('')
    : `<tr><td colspan="8" class="px-5 py-12 text-center text-on-surface-variant text-sm">No data yet.</td></tr>`;

  // Per-membership breakdown
  document.getElementById('kpiMemberTable').innerHTML = profilePnls.length
    ? profilePnls.map(p => `
      <tr class="tbl-row cursor-pointer" onclick="openProfileDetail(${p.id})">
        <td class="px-5 py-3">
          <div class="flex items-center gap-2.5">
            ${avatarHtml(p.name, p.photo_path, 'sm')}
            <span class="text-sm font-medium text-on-surface">${esc(p.name)}</span>
          </div>
        </td>
        <td class="px-5 py-3 text-xs text-on-surface-variant">${esc(p.shop_name || '—')}</td>
        <td class="px-5 py-3 text-center">
          <span class="text-[11px] text-on-surface-variant font-mono">
            <span class="text-emerald-400">${p.profitSplit}%</span> / <span class="text-purple-400">${100 - p.profitSplit}%</span>
            &nbsp;·&nbsp;
            <span class="text-emerald-400">${p.lossSplit}%</span> / <span class="text-purple-400">${100 - p.lossSplit}%</span>
          </span>
        </td>
        <td class="px-5 py-3 text-sm text-on-surface-variant text-right">${m(p.capitalDeployed)}</td>
        <td class="px-5 py-3 text-sm text-on-surface-variant text-right">${p.soldCount}</td>
        <td class="px-5 py-3 text-sm text-on-surface-variant text-right">${p.activeCount}</td>
        <td class="px-5 py-3 text-sm text-right ${cls(p.myShare)} font-semibold">${sgn(p.myShare)}${m(p.myShare)}</td>
      </tr>`).join('')
    : `<tr><td colspan="7" class="px-5 py-12 text-center text-on-surface-variant text-sm">No memberships yet.</td></tr>`;

  // keep any header sort the user picked
  reapplyDomSort(document.getElementById('kpiShopTable').closest('table'));
  reapplyDomSort(document.getElementById('kpiMemberTable').closest('table'));
}
