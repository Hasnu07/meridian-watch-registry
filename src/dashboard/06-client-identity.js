// 06-client-identity.js — Master identity overview, per-shop analytics, edit identity
// Part of the dashboard script: scripts/build.js concatenates src/dashboard/*.js
// in filename order into public/js/dashboard.js (one classic script, so
// functions and top-level variables stay shared exactly as before).

// ── Master Identity overview (aggregates across all memberships) ─────────
// Builds an aggregate `p`-shaped object so the unified Portfolio Summary
// renderer (renderPortfolioSummary9) can be reused. Adds a header band that
// explains the trading-rule mix and watch totals.
function renderClientMasterSummary(client) {
  const memberships = client.memberships || [];
  const allWatches  = memberships.flatMap(m => m.watches || []);
  const cur         = dominantCurrency(allWatches);
  const mc          = v => fmt.price(v || 0, cur);
  const sgn = v => v > 0 ? '+' : '';
  const cls = v => v >= 0 ? 'text-emerald-400' : 'text-error';

  const pnls = memberships.map(m => computePnl(m));
  const sum  = key => pnls.reduce((s, x) => s + (x[key] || 0), 0);
  // Merge per-currency maps across all memberships
  const mergeMaps = key => {
    const out = {};
    for (const p of pnls) {
      const m = p[key] || {};
      for (const [c, v] of Object.entries(m)) out[c] = (out[c] || 0) + v;
    }
    return out;
  };

  const splitCount    = pnls.filter(p => !p.isDiscount).length;
  const discountCount = pnls.length - splitCount;

  // Aggregate `p` for the unified renderer — keep both scalar and by-currency
  // shapes so renderPortfolioSummary9 (which reads the by-currency maps) works.
  const aggP = {
    isDiscount:     discountCount > 0 && splitCount === 0,
    myTotalCost:    sum('myTotalCost'),
    clientTotalCost: sum('clientTotalCost'),
    totalCost:      sum('totalCost'),
    totalListValueActive: sum('totalListValueActive'),
    totalSaleValue: sum('totalSaleValue'),
    totalProfit:    sum('totalProfit'),
    totalLoss:      sum('totalLoss'),
    grossProfit:    sum('grossProfit'),
    grossLoss:      sum('grossLoss'),
    netPnl:         sum('netPnl'),
    myPnl:          sum('myPnl'),
    clientPnl:      sum('clientPnl'),
    wishlistCount:  sum('wishlistCount'),
    purchasedCount: sum('purchasedCount'),
    soldCount:      sum('soldCount'),
    profitWatchCount: sum('profitWatchCount'),
    lossWatchCount:   sum('lossWatchCount'),
    totalWatches:   allWatches.length,
    profitSplit:    null,
    lossSplit:      null,
    // Per-currency maps that the tiles actually render
    myTotalCostByCur:        mergeMaps('myTotalCostByCur'),
    clientTotalCostByCur:    mergeMaps('clientTotalCostByCur'),
    totalCostByCur:          mergeMaps('totalCostByCur'),
    totalListValueActiveByCur: mergeMaps('totalListValueActiveByCur'),
    totalSaleValueByCur:     mergeMaps('totalSaleValueByCur'),
    totalProfitByCur:        mergeMaps('totalProfitByCur'),
    totalLossByCur:          mergeMaps('totalLossByCur'),
    netPnlByCur:             mergeMaps('netPnlByCur'),
    myPnlByCur:              mergeMaps('myPnlByCur'),
    clientPnlByCur:          mergeMaps('clientPnlByCur'),
    // Expenses
    totalExpenses:           sum('totalExpenses'),
    totalExpensesByCur:      mergeMaps('totalExpensesByCur'),
    adjustedNetPnlByCur:     mergeMaps('adjustedNetPnlByCur'),
    // Funding & Payouts
    clientPaidByCur:         mergeMaps('clientPaidByCur'),
    clientOwedByCur:         mergeMaps('clientOwedByCur'),
    clientRemainingByCur:    mergeMaps('clientRemainingByCur'),
    myPaidByCur:             mergeMaps('myPaidByCur'),
    myOwedByCur:             mergeMaps('myOwedByCur'),
    myRemainingByCur:        mergeMaps('myRemainingByCur'),
    // Per-watch arrays so tooltips inside the summary still work
    activeWatches:           pnls.flatMap(p => p.activeWatches || []),
    soldWatches:             pnls.flatMap(p => p.soldWatches   || []),
    wishlistWatches:         pnls.flatMap(p => p.wishlistWatches || []),
    profitWatches:           pnls.flatMap(p => p.profitWatches || []),
    lossWatches:             pnls.flatMap(p => p.lossWatches   || []),
  };

  const ruleMix = splitCount && discountCount
    ? `${splitCount} P/L split · ${discountCount} discount`
    : splitCount ? `${splitCount} P/L split` : `${discountCount} discount`;

  // Discount-only clients get the Discount Split cards; the P/L-split summary
  // only makes sense when at least one membership uses the split rule.
  const allDiscount = discountCount > 0 && splitCount === 0 && !pnls.some(p => p.hasSplitWatches);
  return `
    <div class="space-y-4">
      ${memberships.length > 1 ? `
      <div class="glass-surface rounded-xl p-5 border border-primary/10 flex items-center justify-between flex-wrap gap-3">
        <div>
          <p class="text-[11px] uppercase tracking-[0.06em] font-semibold text-primary">Master Identity Overview</p>
          <p class="text-xs text-on-surface-variant mt-1">Aggregated across ${memberships.length} shop presence${memberships.length !== 1 ? 's' : ''} · ${ruleMix}</p>
        </div>
        <span class="text-[11px] font-semibold uppercase tracking-wider px-3 py-1 rounded-lg border border-primary/30 text-primary bg-primary/5">${allWatches.length} watch${allWatches.length !== 1 ? 'es' : ''}</span>
      </div>` : ''}
      ${pnls.some(p => p.isDiscount || p.hasDiscountWatches) ? renderDiscountClientSummary(pnls.filter(p => p.isDiscount || p.hasDiscountWatches), mc) : ''}
      ${allDiscount ? renderDiscountFunding({ ...aggP, purchasedCount: sum('purchasedCount') }) : renderPortfolioSummary9(aggP, mc, sgn, cls)}
    </div>
  `;
}

// Client Summary (Discount Split v2 §6) — top of the client page
function renderDiscountClientSummary(pnls, mc) {
  const sum = key => pnls.reduce((s, x) => s + (x[key] || 0), 0);
  const disc   = sum('discountIncome');
  const market = sum('totalMarketValue');
  const std    = pnls[0]?.discountSplit ?? 0.065;
  const owed   = sum('lossOutstanding');
  const rec    = dsRecoveredBreakdown(pnls.flatMap(p => p.lossWatches || []));
  const cpnl   = sum('clientPnl');
  const tiles = [
    dsKpi('Total discount earned', `+${mc(disc)}`, `${pnls.reduce((n, p) => n + (p.profitWatches || []).length, 0)} handovers`, 'gold', 'Sum of Panel A effective discounts'),
    dsKpi('Average effective discount', market ? `${(disc / market * 100).toFixed(2)}%` : '—', `vs ${(std * 100).toFixed(2)}% standard`, 'gold', 'Total discount ÷ total market price'),
    dsKpi('Losses still owed to me', mc(owed), 'Panel B outstanding', owed > 0 ? 'debt' : 'good'),
    dsKpi('Losses recovered so far', mc(sum('totalLossPaid')), `${mc(rec.transfers)} transfers · ${mc(rec.offsets)} offsets`, 'good'),
    dsKpi('Total client contributions', mc(sum('clientContribOpen')), 'on open watches', 'client'),
    dsKpi('Client P&L', `${cpnl > 0 ? '+' : ''}${mc(cpnl)}`, 'client price − list, net of losses', cpnl >= 0 ? 'good' : 'debt', "The client's result — never counted as mine"),
  ];
  return dsCard('Discount Split', 'Client Summary', '',
    `<div class="px-6 pb-6 grid grid-cols-2 md:grid-cols-3 min-[1500px]:grid-cols-6 gap-3">${tiles.join('')}</div>`, 'border-amber-400/15');
}

// ── Per-shop analytics strip (inside each membership card) ───────────────
function renderMembershipAnalytics(membership) {
  const p   = computePnl(membership);
  const cur = dominantCurrency(membership.watches || []);
  const mc  = v => fmt.price(v || 0, cur);
  const sgn = v => v > 0 ? '+' : '';
  const cls = v => v >= 0 ? 'text-emerald-400' : 'text-error';

  const ruleBadge = p.isDiscount
    ? `<span class="text-[11px] font-semibold uppercase tracking-wider px-3 py-1 rounded-lg border text-amber-400 border-amber-400/30 bg-amber-400/5">🏷 Discount · ${(p.discountSplit * 100).toFixed(2)}%</span>`
    : `<span class="text-[11px] font-semibold uppercase tracking-wider px-3 py-1 rounded-lg border text-purple-400 border-purple-400/30 bg-purple-400/5">% P/L Split · ${p.profitSplit}/${100 - p.profitSplit}</span>`;

  return `
    <div class="px-8 py-5 border-b border-outline-variant/10" style="background:rgba(255,255,255,0.012)">
      <div class="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <p class="text-[11px] uppercase tracking-[0.06em] text-outline font-semibold">Shop Analytics</p>
        ${ruleBadge}
      </div>
      <div class="grid grid-cols-3 lg:grid-cols-6 gap-2.5">
        <div class="bg-amber-500/5 border border-amber-500/10 rounded-lg px-3 py-2.5">
          <p class="text-[11px] uppercase tracking-wider text-on-surface-variant">Wishlist</p>
          <p class="font-playfair text-base text-amber-400">${p.wishlistCount}</p>
        </div>
        <div class="bg-blue-500/5 border border-blue-500/10 rounded-lg px-3 py-2.5">
          <p class="text-[11px] uppercase tracking-wider text-on-surface-variant">Purchased</p>
          <p class="font-playfair text-base text-purple-400">${p.purchasedCount}</p>
        </div>
        <div class="bg-emerald-500/5 border border-emerald-500/10 rounded-lg px-3 py-2.5">
          <p class="text-[11px] uppercase tracking-wider text-on-surface-variant">Sold</p>
          <p class="font-playfair text-base text-emerald-400">${p.soldCount}</p>
        </div>
        ${p.isDiscount ? `
        <div class="bg-amber-500/5 border border-amber-500/10 rounded-lg px-3 py-2.5">
          <p class="text-[11px] uppercase tracking-wider text-on-surface-variant">Income</p>
          <p class="font-playfair text-base text-amber-400">+${mc(p.discountIncome)}</p>
        </div>
        <div class="bg-error/5 border border-error/10 rounded-lg px-3 py-2.5">
          <p class="text-[11px] uppercase tracking-wider text-on-surface-variant">Loss Expo.</p>
          <p class="font-playfair text-base ${p.totalLossAmount > 0 ? 'text-error' : 'text-on-surface-variant'}">${mc(p.totalLossAmount)}</p>
        </div>
        <div class="bg-white/[0.03] border border-outline-variant/15 rounded-lg px-3 py-2.5">
          <p class="text-[11px] uppercase tracking-wider text-on-surface-variant">Receivable</p>
          <p class="font-playfair text-base ${p.lossOutstanding > 0 ? 'text-amber-400' : 'text-emerald-400'}">${mc(p.lossOutstanding)}</p>
        </div>
        ` : `
        <div class="bg-emerald-500/5 border border-emerald-500/10 rounded-lg px-3 py-2.5">
          <p class="text-[11px] uppercase tracking-wider text-on-surface-variant">Profit</p>
          <p class="font-playfair text-base text-emerald-400">${sgn(p.grossProfit)}${mc(p.grossProfit)}</p>
        </div>
        <div class="bg-error/5 border border-error/10 rounded-lg px-3 py-2.5">
          <p class="text-[11px] uppercase tracking-wider text-on-surface-variant">Loss</p>
          <p class="font-playfair text-base ${p.grossLoss < 0 ? 'text-error' : 'text-on-surface-variant'}">${p.grossLoss !== 0 ? sgn(p.grossLoss) : ''}${mc(p.grossLoss)}</p>
        </div>
        <div class="bg-white/[0.03] border border-outline-variant/15 rounded-lg px-3 py-2.5">
          <p class="text-[11px] uppercase tracking-wider text-on-surface-variant">Net P&amp;L</p>
          <p class="font-playfair text-base ${cls(p.netPnl)}">${sgn(p.netPnl)}${mc(p.netPnl)}</p>
        </div>
        `}
      </div>
    </div>
  `;
}

function renderMembershipCard(client, m, masterIdBadge) {
  const shopLabel = [m.shop_name, m.portfolio_name].filter(Boolean).join(' · ');
  const watches   = m.watches || [];

  function field(label, value, mono) {
    return `<div class="flex flex-col gap-0.5">
      <span class="text-[11px] uppercase tracking-[0.06em] text-outline font-semibold">${label}</span>
      <span class="text-sm ${mono ? 'font-mono' : ''} text-on-surface">${value ? esc(value) : '<span class="text-outline/50">—</span>'}</span>
    </div>`;
  }

  const fullName = [m.title, m.first_name, m.last_name].filter(Boolean).join(' ') || null;
  const fullAddr = [m.address, m.postal_code ? m.postal_code + (m.city ? ' ' + m.city : '') : m.city, m.country].filter(Boolean).join(', ') || null;

  return `
    <div class="glass-surface rounded-xl overflow-hidden">

      <!-- ── Card header ── -->
      <div class="px-8 py-5 flex items-center justify-between gap-4 border-b border-outline-variant/10" style="background:rgba(255,255,255,0.015)">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <span class="material-symbols-outlined text-primary">store</span>
          </div>
          <div>
            <p class="text-[11px] uppercase tracking-[0.06em] text-primary font-semibold">${esc(shopLabel || 'Unassigned')}</p>
            <p class="text-on-surface-variant text-xs mt-0.5">${watches.length} watch${watches.length !== 1 ? 'es' : ''} · added ${fmt.date(m.created_at.split(' ')[0])}</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button onclick="openAddWatch(${m.id})" class="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant px-4 py-2 border border-outline-variant/30 rounded-lg hover:bg-surface-variant/30 hover:text-on-surface transition-all flex items-center gap-1.5">
            <span class="material-symbols-outlined text-[14px]">add_circle</span> Add Watch
          </button>
          <button onclick="openProfileDetail(${m.id})" class="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant px-4 py-2 border border-outline-variant/30 rounded-lg hover:bg-surface-variant/30 hover:text-on-surface transition-all flex items-center gap-1.5">
            <span class="material-symbols-outlined text-[14px]">open_in_new</span> View
          </button>
          <button onclick="openEditProfile(${m.id})" class="text-[11px] font-semibold uppercase tracking-wider text-primary px-4 py-2 border border-primary/20 rounded-lg hover:bg-primary/10 transition-all flex items-center gap-1.5">
            <span class="material-symbols-outlined text-[14px]">edit</span> Edit
          </button>
          <button onclick="confirmDeleteMembership(${m.id},'${esc(m.shop_name||'this shop').replace(/'/g,"\\'")}' )"
                  title="Remove shop presence"
                  class="p-2 rounded-lg hover:bg-error/10 text-on-surface-variant hover:text-error transition-colors">
            <span class="material-symbols-outlined text-[16px]">person_remove</span>
          </button>
        </div>
      </div>

      <!-- ── Contact + Registry IDs (only filled fields) ── -->
      ${(() => {
        const cells = [
          ['Email', m.email], ['PP URN', m.pp_urn, true], ['Full Name', fullName],
          ['Gender', m.gender === 'M' ? 'Male' : m.gender === 'F' ? 'Female' : m.gender],
          ['Date of Birth', m.dob], ['Address', fullAddr],
        ].filter(([, v]) => v);
        return cells.length
          ? `<div class="px-8 py-5 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-x-10 gap-y-4 border-b border-outline-variant/10">${cells.map(([l, v, mono]) => field(l, v, mono)).join('')}</div>`
          : `<div class="px-8 py-3 border-b border-outline-variant/10"><button onclick="openEditProfile(${m.id})" class="text-xs text-outline hover:text-primary transition-colors flex items-center gap-1.5"><span class="material-symbols-outlined text-[15px]">person_add</span> No contact details yet — add them</button></div>`;
      })()}

      <!-- ── ID Document ── -->
      <div class="px-8 py-3 flex items-center gap-4 border-b border-outline-variant/10">
        <p class="text-[11px] uppercase tracking-[0.06em] text-outline font-semibold w-28 flex-shrink-0">ID Document</p>
        ${m.id_card_path ? `
          <div class="flex items-center gap-3">
            <div class="w-16 h-12 rounded-lg overflow-hidden border border-outline-variant/20 flex-shrink-0 cursor-zoom-in" onclick="openLightbox('${m.id_card_path}')">
              <img src="${m.id_card_path}" class="w-full h-full object-cover opacity-80 hover:opacity-100 transition-opacity">
            </div>
            <div class="flex flex-col gap-1.5">
              <button onclick="openLightbox('${m.id_card_path}')" class="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-primary border border-primary/20 px-3 py-1.5 rounded-lg hover:bg-primary/10 transition-all w-fit">
                <span class="material-symbols-outlined text-[13px]">visibility</span> View Full Size
              </button>
              <button onclick="confirmDeleteIdCard(${m.id})" class="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-error border border-error/20 px-3 py-1.5 rounded-lg hover:bg-error/10 transition-all w-fit">
                <span class="material-symbols-outlined text-[13px]">delete</span> Remove
              </button>
            </div>
          </div>
        ` : `
          <button onclick="openEditProfile(${m.id})" class="flex items-center gap-2 text-xs text-outline hover:text-primary transition-colors">
            <span class="material-symbols-outlined text-[16px]">upload_file</span> No document on file — click Edit to upload
          </button>
        `}
      </div>

      <!-- ── Shop Analytics ── -->
      ${renderMembershipAnalytics(m)}

      <!-- ── Watches ── -->
      ${watches.length ? `
      <div class="overflow-x-auto">
        <table class="w-full text-left">
          <thead>
            <tr class="border-b border-outline-variant/10" style="background:rgba(255,255,255,0.02)">
              <th class="px-8 py-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-on-surface-variant">Timepiece</th>
              <th class="px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-on-surface-variant">Stock #</th>
              <th class="px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-on-surface-variant">Status</th>
              <th class="px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-on-surface-variant">Serial #</th>
              <th class="px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-on-surface-variant">Ref #</th>
              <th class="px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-on-surface-variant">List Price</th>
              <th class="px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-on-surface-variant">Sale Price</th>
              <th class="px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-on-surface-variant">Date</th>
              <th class="px-6 py-3"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-white/[0.04]">
            ${watches.map(w => {
              const wc = w.currency || 'CHF';
              return `
            <tr class="tbl-row">
              <td class="px-8 py-4">
                <div class="flex items-center gap-3">
                  ${w.image_path
                    ? `<div class="w-12 h-12 rounded-lg border border-outline-variant/20 overflow-hidden flex-shrink-0 cursor-zoom-in" onclick="openLightbox('${w.image_path}')"><img src="${w.image_path}" class="w-full h-full object-cover"></div>`
                    : `<div class="w-12 h-12 rounded-lg border border-outline-variant/15 flex items-center justify-center flex-shrink-0"><span class="material-symbols-outlined text-outline text-[20px]">watch</span></div>`
                  }
                  <div>
                    <p class="text-on-surface text-sm font-medium leading-tight">${esc(w.model)}</p>
                    ${w.movement_number || w.case_number ? `<p class="text-on-surface-variant text-xs mt-0.5 font-mono">${[w.movement_number, w.case_number].filter(Boolean).join(' / ')}</p>` : ''}
                  </div>
                </div>
              </td>
              <td class="px-5 py-3 text-on-surface-variant text-sm font-mono">${w.stock_number ? esc(w.stock_number) : '<span class="text-outline">—</span>'}</td>
              <td class="px-5 py-3">${statusBadge(w.status)}</td>
              <td class="px-5 py-3 text-on-surface-variant text-sm font-mono">${esc(w.serial_number || '—')}</td>
              <td class="px-5 py-3 text-on-surface-variant text-sm font-mono">${esc(w.reference_number || '—')}</td>
              <td class="px-5 py-3 text-on-surface-variant text-sm">${w.list_price != null ? fmt.price(w.list_price, wc) : '<span class="text-outline">—</span>'}</td>
              <td class="px-5 py-3 text-sm">${w.status === 'sold' && w.market_price != null
                ? `<span class="text-primary font-semibold">${fmt.price(watchRule(w, m) === 'discount' ? discountCalc(w, m).clientPrice : w.sale_price, wc)}</span><span class="block text-[11px] text-on-surface-variant/60 mt-0.5">handover · market ${fmt.price(w.market_price, wc)}</span>`
                : w.status === 'sold' && w.sale_price != null ? `<span class="text-primary font-semibold">${fmt.price(w.sale_price, wc)}</span>` : '<span class="text-outline">—</span>'}</td>
              <td class="px-5 py-3 text-on-surface-variant text-sm">${fmt.date(w.purchase_date)}</td>
              <td class="px-5 py-3">
                <div class="flex items-center justify-end gap-1">
                  ${w.status === 'purchased' ? `
                  <button onclick="openMarkSoldModal(${w.id})" class="p-1.5 rounded-lg hover:bg-emerald-500/10 text-on-surface-variant hover:text-emerald-400 transition-colors" title="Mark as Sold">
                    <span class="material-symbols-outlined text-[16px]">sell</span>
                  </button>` : ''}
                  <button onclick="openEditWatch(${w.id})" class="p-1.5 rounded-lg hover:bg-surface-variant/30 text-on-surface-variant hover:text-primary transition-colors">
                    <span class="material-symbols-outlined text-[16px]">edit</span>
                  </button>
                  <button onclick="confirmDeleteWatch(${w.id},'${esc(w.model).replace(/'/g,"\\'")}')" class="p-1.5 rounded-lg hover:bg-error/10 text-on-surface-variant hover:text-error transition-colors">
                    <span class="material-symbols-outlined text-[16px]">delete</span>
                  </button>
                </div>
              </td>
            </tr>`;}).join('')}
          </tbody>
        </table>
      </div>` : `
      <div class="px-8 py-6 flex items-center gap-3 text-on-surface-variant text-sm">
        <span class="material-symbols-outlined text-[18px]">watch_off</span>
        No watches at this location yet.
        <button onclick="openAddWatch(${m.id})" class="ml-2 text-primary text-xs font-semibold hover:underline">Add one →</button>
      </div>`}
    </div>`;
}

document.getElementById('backToClients').addEventListener('click', () => showPage('profiles'));

// ── Edit master client identity ────────────────────────────────────────────

function openEditClient(id) {
  api('GET', `/api/clients/${id}`).then(c => {
    document.getElementById('ceClientId').value  = c.id;
    document.getElementById('ceMasterId').value  = c.master_id || '';
    document.getElementById('ceName').value      = c.name;
    document.getElementById('cePhoto').value     = '';
    document.getElementById('cePhotoChosen').classList.add('hidden');
    document.getElementById('ceFormError').classList.add('hidden');
    const prev = document.getElementById('cePhotoPreview');
    prev.innerHTML = c.photo_path
      ? `<img src="${c.photo_path}" class="w-full h-full object-cover">`
      : `<span class="material-symbols-outlined text-outline text-2xl">person</span>`;
    document.getElementById('clientEditModal').classList.remove('hidden');
    document.getElementById('ceName').focus();
  });
}

function closeClientEditModal() { document.getElementById('clientEditModal').classList.add('hidden'); }
document.getElementById('closeClientEditModal').addEventListener('click', closeClientEditModal);
document.getElementById('cancelClientEditModal').addEventListener('click', closeClientEditModal);
document.getElementById('clientEditModal').addEventListener('click', e => { if (e.target === e.currentTarget) closeClientEditModal(); });

document.getElementById('cePhoto').addEventListener('change', e => {
  const file = e.target.files[0];
  const pc   = document.getElementById('cePhotoChosen');
  if (file) {
    pc.textContent = '✓ ' + file.name; pc.classList.remove('hidden');
    const reader = new FileReader();
    reader.onload = ev => { document.getElementById('cePhotoPreview').innerHTML = `<img src="${ev.target.result}" class="w-full h-full object-cover">`; };
    reader.readAsDataURL(file);
  } else pc.classList.add('hidden');
});

document.getElementById('saveClientEditBtn').addEventListener('click', async () => {
  const id       = document.getElementById('ceClientId').value;
  const name     = document.getElementById('ceName').value.trim();
  const masterId = document.getElementById('ceMasterId').value.trim();
  const errEl    = document.getElementById('ceFormError');
  errEl.classList.add('hidden');
  if (!name) { errEl.textContent = 'Name is required'; errEl.classList.remove('hidden'); return; }
  if (!masterId) { errEl.textContent = 'Master ID is required'; errEl.classList.remove('hidden'); return; }
  const fd = new FormData();
  fd.append('name', name);
  fd.append('master_id', masterId);
  const file = document.getElementById('cePhoto').files[0];
  if (file) fd.append('photo', file);
  try {
    await api('PUT', `/api/clients/${id}`, fd);
    closeClientEditModal();
    if (currentPage === 'client-detail') openClientDetail(id);
    else if (currentPage === 'profiles') loadClients();
  } catch (e) { errEl.textContent = e.message; errEl.classList.remove('hidden'); }
});

function confirmDeleteClient(id, name) {
  showConfirm(`Delete master client "${name}"? Their shop memberships and watches will also be deleted.`, async () => {
    await api('DELETE', `/api/clients/${id}`);
    showPage('profiles');
  });
}

function confirmDeleteIdCard(profileId) {
  showConfirm('Remove this ID document? The file will be permanently deleted.', async () => {
    await api('DELETE', `/api/profiles/${profileId}/id-card`);
    openClientDetail(currentClientId);
  });
}

function confirmDeleteMembership(profileId, shopName) {
  showConfirm(`Remove presence at "${shopName}"? All watches at this location will also be deleted.`, async () => {
    await api('DELETE', `/api/profiles/${profileId}`);
    openClientDetail(currentClientId);
  });
}
