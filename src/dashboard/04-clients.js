// 04-clients.js — Clients page, list/cards toggle, client detail
// Part of the dashboard script: scripts/build.js concatenates src/dashboard/*.js
// in filename order into public/js/dashboard.js (one classic script, so
// functions and top-level variables stay shared exactly as before).

// ── Master Clients (Clients page) ──────────────────────────────────────────
let allClients = [];
let clientPage = 1;
const PER_PAGE = 15;

// ── List / Cards layout toggle ─────────────────────────────────────────────
// One toggle per list page (same spot: top-right of the page header). The
// choice is a per-browser convenience, so it lives in localStorage; if that
// is unavailable the page just falls back to its default layout.
const VIEW_DEFAULTS = { clients: 'list', watches: 'list', shops: 'cards', portfolios: 'cards', shopDetail: 'list', portfolioDetail: 'list' };
const VIEW_RENDERERS = {
  clients:    () => renderClients(),
  watches:    () => renderWatches(),
  shops:      () => renderShops(),
  portfolios: () => renderAllPortfolios(),
  shopDetail: () => renderShopDetailLists(),
  portfolioDetail: () => renderPortfolioDetailClients(),
};
function getView(key) {
  try {
    const v = localStorage.getItem('meridian.view.' + key);
    if (v === 'list' || v === 'cards') return v;
  } catch {}
  return VIEW_DEFAULTS[key] || 'list';
}
function syncViewToggle(key) {
  const v = getView(key);
  document.querySelectorAll(`.view-toggle[data-view-key="${key}"] button`).forEach(b => {
    const on = b.dataset.view === v;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-pressed', String(on));
  });
}
function setView(key, v) {
  try { localStorage.setItem('meridian.view.' + key, v); } catch {}
  syncViewToggle(key);
  VIEW_RENDERERS[key]?.();
}
document.addEventListener('click', e => {
  const btn = e.target.closest('.view-toggle button[data-view]');
  if (!btn) return;
  setView(btn.closest('.view-toggle').dataset.viewKey, btn.dataset.view);
});
Object.keys(VIEW_DEFAULTS).forEach(syncViewToggle);

// Shared action-button class for card footers
const CARD_ICON_BTN = 'p-2 rounded-lg hover:bg-surface-variant/30 text-on-surface-variant hover:text-primary transition-colors';

function clientCardHtml(c) {
  const shops   = c.membership_count;
  const watches = c.watch_count;
  return `
  <div class="view-card group cursor-pointer" onclick="openClientDetail(${c.id})">
    <div class="flex items-center gap-3">
      ${avatarHtml(c.name, c.photo_path)}
      <div class="min-w-0 flex-1">
        <p class="text-on-surface font-semibold text-[15px] truncate">${esc(c.name)}</p>
        ${c.master_id ? `<span class="font-mono text-[11px] text-primary/90 bg-primary/10 px-1.5 py-0.5 rounded border border-primary/15">#${esc(c.master_id)}</span>` : `<span class="text-xs text-outline">No client ID</span>`}
      </div>
    </div>
    <div class="grid grid-cols-2 gap-2 mt-4">
      <div class="view-card-stat">
        <p class="view-card-label">Shops</p>
        <p class="font-mono text-xl font-semibold text-on-surface">${shops}</p>
      </div>
      <div class="view-card-stat">
        <p class="view-card-label">Watches</p>
        <p class="font-mono text-xl font-semibold text-on-surface">${watches}</p>
      </div>
    </div>
    <div class="flex items-center justify-between mt-4 pt-3 border-t border-outline-variant/40">
      <span class="text-xs text-outline">Since <span class="font-mono text-on-surface-variant">${fmt.date(c.created_at.split(' ')[0])}</span></span>
      <div class="flex items-center gap-0.5">
        <button onclick="event.stopPropagation(); generateClientShareLink(${c.id})" title="Copy share link" aria-label="Copy share link" class="${CARD_ICON_BTN}">
          <span class="material-symbols-outlined text-[18px]">link</span>
        </button>
        <button onclick="event.stopPropagation(); openEditClient(${c.id})" title="Edit Identity" aria-label="Edit client" class="${CARD_ICON_BTN}">
          <span class="material-symbols-outlined text-[18px]">edit</span>
        </button>
        <button onclick="event.stopPropagation(); confirmDeleteClient(${c.id},'${esc(c.name).replace(/'/g,"\\'")}')" title="Delete" aria-label="Delete client" class="p-2 rounded-lg hover:bg-error/10 text-on-surface-variant hover:text-error transition-colors">
          <span class="material-symbols-outlined text-[18px]">delete</span>
        </button>
      </div>
    </div>
  </div>`;
}

function watchTileHtml(w) {
  const cur = w.currency || 'CHF';
  const img = w.image_path
    ? `<img src="${w.image_path}" alt="" class="absolute inset-0 w-full h-full object-cover cursor-zoom-in" onclick="event.stopPropagation(); openLightbox('${w.image_path}')">`
    : `<span class="material-symbols-outlined text-outline/70 text-[32px]">watch</span>`;
  const priceLine = w.status === 'sold' && w.sale_price != null
    ? `<p class="font-mono text-lg font-semibold text-emerald-400">${fmt.price(w.sale_price, cur)}</p>
       <p class="text-xs text-outline font-mono">${w.list_price != null ? `List ${fmt.price(w.list_price, cur)}` : '&nbsp;'}</p>`
    : w.list_price != null
      ? `<p class="font-mono text-lg font-semibold text-on-surface">${fmt.price(w.list_price, cur)}</p><p class="text-xs text-outline">List price</p>`
      : `<p class="font-mono text-lg font-semibold text-outline">—</p><p class="text-xs text-outline">No price yet</p>`;
  return `
  <div class="view-card !p-0 overflow-hidden group flex flex-col h-full">
    <div class="relative h-48 flex-shrink-0 overflow-hidden bg-surface-container-lowest grid place-items-center border-b border-outline-variant/40">
      ${img}
      <div class="absolute top-2.5 left-2.5">${statusBadge(w.status)}</div>
    </div>
    <div class="p-4 flex-1 flex flex-col">
      <p class="text-on-surface font-semibold text-[15px] leading-snug truncate" title="${esc(w.model)}">${esc(w.model)}</p>
      <p class="text-xs text-on-surface-variant truncate mt-0.5">${esc(w.client_name || '—')}${w.shop_name ? ` · <span class="text-outline">${esc(w.shop_name)}</span>` : ''}</p>
      <div class="mt-3">${priceLine}</div>
      <p class="text-xs font-mono text-outline mt-2 mb-3 truncate">
        ${w.stock_number ? `<span class="text-on-surface-variant">${esc(w.stock_number)}</span>` : 'No stock #'}
        ${w.purchase_date ? ` · ${fmt.date(w.purchase_date)}` : ''}
      </p>
      <div class="flex items-center justify-between gap-2 mt-auto pt-3 border-t border-outline-variant/40">
        ${w.status !== 'sold' ? `<button onclick="openMarkSoldModal(${w.id})" title="Mark as Sold" class="text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1.5 rounded-lg border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition-all flex items-center gap-1">
          <span class="material-symbols-outlined text-[13px]">sell</span> Sold
        </button>` : '<span></span>'}
        <div class="flex items-center gap-0.5">
          <button onclick="openWatchDetail(${w.id})" title="View watch detail" aria-label="View watch detail" class="${CARD_ICON_BTN}">
            <span class="material-symbols-outlined text-[18px]">open_in_new</span>
          </button>
          <button onclick="openEditWatch(${w.id})" title="Edit" aria-label="Edit watch" class="${CARD_ICON_BTN}">
            <span class="material-symbols-outlined text-[18px]">edit</span>
          </button>
          <button onclick="confirmDeleteWatch(${w.id},'${esc(w.model).replace(/'/g,"\\'")}')" title="Delete" aria-label="Delete watch" class="p-2 rounded-lg hover:bg-error/10 text-on-surface-variant hover:text-error transition-colors">
            <span class="material-symbols-outlined text-[18px]">delete</span>
          </button>
        </div>
      </div>
    </div>
  </div>`;
}

async function loadClients() {
  allClients = await api('GET', '/api/clients');
  clientPage = 1;
  renderClients();
}

function renderClients() {
  const q     = document.getElementById('profileSearch').value.trim().toLowerCase();
  const data  = sortClientList(q ? allClients.filter(c => c.name.toLowerCase().includes(q)) : allClients);
  const total = data.length;
  const slice = data.slice((clientPage - 1) * PER_PAGE, clientPage * PER_PAGE);

  const asCards = getView('clients') === 'cards';
  document.getElementById('profilesListWrap').classList.toggle('hidden', asCards);
  document.getElementById('profilesCards').classList.toggle('hidden', !asCards);
  if (asCards) {
    document.getElementById('profilesCards').innerHTML = slice.map(clientCardHtml).join('')
      || `<div class="col-span-full py-16 text-center text-on-surface-variant text-sm">No clients found.</div>`;
    renderPagination('profilesPagination', clientPage, total, PER_PAGE, n => { clientPage = n; renderClients(); });
    return;
  }

  document.getElementById('profilesBody').innerHTML = slice.map(c => `
    <tr class="tbl-row cursor-pointer" onclick="openClientDetail(${c.id})">
      <td class="px-5 py-3">
        <div class="flex items-center gap-4">
          ${avatarHtml(c.name, c.photo_path)}
          <div>
            <div class="flex items-center gap-2">
              <span class="text-on-surface font-medium text-sm">${esc(c.name)}</span>
              ${c.master_id ? `<span class="font-mono text-[11px] text-primary/90 bg-primary/10 px-1.5 py-0.5 rounded border border-primary/15">#${esc(c.master_id)}</span>` : ''}
            </div>
            <div class="text-on-surface-variant text-xs mt-0.5">${c.membership_count} shop presence${c.membership_count !== 1 ? 's' : ''}</div>
          </div>
        </div>
      </td>
      <td class="px-5 py-3">
        <div class="flex items-center gap-1.5 text-on-surface-variant text-sm">
          <span class="material-symbols-outlined text-[15px]">store</span>
          ${c.membership_count} shop${c.membership_count !== 1 ? 's' : ''}
        </div>
      </td>
      <td class="px-5 py-3">
        <div class="flex items-center gap-1.5 text-on-surface-variant text-sm">
          <span class="material-symbols-outlined text-[15px]">watch</span>
          ${c.watch_count} watch${c.watch_count !== 1 ? 'es' : ''}
        </div>
      </td>
      <td class="px-5 py-3 text-on-surface-variant text-sm">${fmt.date(c.created_at.split(' ')[0])}</td>
      <td class="px-5 py-3">
        <div class="flex items-center justify-end gap-1">
          <button onclick="event.stopPropagation(); openClientDetail(${c.id})" title="View" class="p-2 rounded-lg hover:bg-surface-variant/30 text-on-surface-variant hover:text-primary transition-colors">
            <span class="material-symbols-outlined text-[18px]">open_in_new</span>
          </button>
          <button onclick="event.stopPropagation(); generateClientShareLink(${c.id})" title="Copy share link" class="p-2 rounded-lg hover:bg-surface-variant/30 text-on-surface-variant hover:text-primary transition-colors">
            <span class="material-symbols-outlined text-[18px]">link</span>
          </button>
          <button onclick="event.stopPropagation(); openEditClient(${c.id})" title="Edit Identity" class="p-2 rounded-lg hover:bg-surface-variant/30 text-on-surface-variant hover:text-primary transition-colors">
            <span class="material-symbols-outlined text-[18px]">edit</span>
          </button>
          <button onclick="event.stopPropagation(); confirmDeleteClient(${c.id},'${esc(c.name).replace(/'/g,"\\'")}')" title="Delete" class="p-2 rounded-lg hover:bg-error/10 text-on-surface-variant hover:text-error transition-colors">
            <span class="material-symbols-outlined text-[18px]">delete</span>
          </button>
        </div>
      </td>
    </tr>
  `).join('') || `<tr><td colspan="5" class="px-6 py-16 text-center text-on-surface-variant text-sm">No clients found.</td></tr>`;

  renderPagination('profilesPagination', clientPage, total, PER_PAGE, n => { clientPage = n; renderClients(); });
}

document.getElementById('profileSearch').addEventListener('input', () => { clientPage = 1; renderClients(); });
document.getElementById('addProfileBtn').addEventListener('click', () => openAddProfile());

// ── Client detail (cross-shop master identity view) ────────────────────────
let currentClientId = null;
let _currentClientData = null;   // full client (memberships + watches) for the Excel report

// Build and download a per-client Excel workbook. Generated client-side from
// the same data the detail page renders, so figures match the tiles exactly
// (computePnl + watchPayoutBalance are reused — no server-side math copy).
function downloadClientReport() {
  const client = _currentClientData;
  if (!client) { alert('Open a client first.'); return; }
  if (typeof XLSX === 'undefined') { alert('Report engine still loading — try again in a moment.'); return; }

  const memberships = client.memberships || [];
  const today = new Date().toISOString().split('T')[0];
  const rnd = v => (v == null || v === '' || isNaN(v)) ? '' : Math.round(v);
  const mergeInto = (acc, map) => { for (const [k, v] of Object.entries(map || {})) acc[k] = (acc[k] || 0) + v; return acc; };

  // Aggregate per-currency maps across memberships (mirrors master summary)
  const agg = { myTotalCostByCur:{}, clientTotalCostByCur:{}, totalProfitByCur:{}, totalLossByCur:{},
                netPnlByCur:{}, myPnlByCur:{}, clientPnlByCur:{}, totalExpensesByCur:{},
                clientRemainingByCur:{}, myRemainingByCur:{} };

  // ── Watches sheet ──
  const wRows = [[ 'Shop','Membership','Stock #','Reference','Model','Status','Rule','Currency','List Price','Sale Price',
                   'Market Price','Client Price','Discount %','Offset','Client Owes Me','Gross P&L','My Cost','Client Cost','My P&L','Client P&L','Paid to Me','Paid to Client',
                   'My Outstanding','Client Outstanding','Expenses','Loss Status','Date','Sold To','Serial' ]];
  // ── Transactions sheet ──
  const tRows = [[ 'Shop','Reference','Type','Date','Category / Method','Amount','Currency','Notes','Reversed' ]];
  // ── Per-membership summary rows ──
  const memRows = [[ 'Shop','Membership','Rule','Watches','Sold','Net P&L','My P&L','Client P&L','Expenses' ]];

  for (const m of memberships) {
    const p = computePnl(m);
    for (const k of Object.keys(agg)) mergeInto(agg[k], p[k]);
    memRows.push([ m.shop_name || '—', m.name || '—', ((m.trading_rule || 'split') === 'discount' ? 'Discount' : 'P/L Split') + ((m.trading_rule || 'split') === 'discount' ? (p.hasSplitWatches ? ' + P/L sales' : '') : (p.hasDiscountWatches ? ' + Discount sales' : '')),
                   (m.watches || []).length, p.soldCount || 0, rnd(p.netPnl), rnd(p.myPnl), rnd(p.clientPnl), rnd(p.totalExpenses) ]);

    for (const w of (m.watches || [])) {
      const cur  = w.currency || 'CHF';
      const sold = w.status === 'sold';
      const ww = { ...w, profile: m };
      const mb = watchPayoutBalance(ww, 'my');
      const cb = watchPayoutBalance(ww, 'client');
      const dx = mb.dc;   // Discount Split v2 figures (discount profiles only)
      const gross = dx ? dx.rawDiff : (sold && w.list_price != null && w.sale_price != null) ? (w.sale_price - w.list_price) : '';
      const expSum = (w.expenses || []).filter(x => !x.reversed).reduce((s, x) => s + x.amount, 0);
      wRows.push([
        m.shop_name || '—', m.name || '—', w.stock_number || '', w.reference_number || '—', w.model || '—',
        w.status || '—', sold ? (watchRule(w, m) === 'discount' ? 'Discount' : 'P/L Split') : '', cur, rnd(w.list_price), sold ? rnd(w.sale_price) : '',
        sold && w.market_price != null ? rnd(w.market_price) : '',
        dx?.isProfit ? rnd(dx.clientPrice) : (sold && w.market_price != null ? rnd(w.sale_price) : ''),
        dx?.isProfit ? Math.round(dx.discPct * 10000) / 100 : (sold && w.market_price ? Math.round(splitHandoverDisc(w) / w.market_price * 10000) / 100 : ''),
        dx?.isProfit ? rnd(dx.offset) : '',
        dx?.isLoss ? rnd(dx.outstanding) : '',
        gross === '' ? '' : rnd(gross), rnd(w.my_cost), rnd(w.client_cost),
        sold ? rnd(mb.share) : '', sold ? rnd(cb.share) : '',
        rnd(mb.paid), rnd(cb.paid), rnd(Math.max(0, mb.remaining)), rnd(Math.max(0, cb.remaining)),
        rnd(expSum), w.loss_status || '', w.purchase_date || '', w.sold_to || '', w.serial_number || '',
      ]);

      // transactions: expenses, client payouts, my payouts, loss payments
      for (const ex of (w.expenses || []))
        tRows.push([ m.shop_name || '—', w.reference_number || '—', 'Expense', ex.date || '', expenseCategoryLabel(ex.category), rnd(ex.amount), ex.currency || cur, ex.description || '', ex.reversed ? 'YES' : '' ]);
      for (const px of (w.client_payouts || []))
        tRows.push([ m.shop_name || '—', w.reference_number || '—', 'Client Payout', px.date || '', px.method || '', rnd(px.amount), px.currency || cur, px.notes || '', px.reversed ? 'YES' : '' ]);
      for (const px of (w.my_payouts || []))
        tRows.push([ m.shop_name || '—', w.reference_number || '—', 'My Withdrawal', px.date || '', px.method || '', rnd(px.amount), px.currency || cur, px.notes || '', px.reversed ? 'YES' : '' ]);
      for (const lp of (w.loss_payments || []))
        tRows.push([ m.shop_name || '—', w.reference_number || '—', 'Loss Recovery', lp.date || '', recoveryMethodLabel(lp), rnd(lp.amount), cur, lp.notes || '', lp.reversed ? 'YES' : '' ]);
    }
  }

  // ── Summary sheet ──
  const totalWatches = memberships.reduce((s, m) => s + (m.watches || []).length, 0);
  const currencies = Array.from(new Set(Object.values(agg).flatMap(mp => Object.keys(mp)))).sort();
  const sumRows = [
    ['Meridian — Client Report'],
    ['Client', client.name || ''],
    ['Master ID', client.master_id || ''],
    ['Generated', today],
    ['Shop presences', memberships.length],
    ['Total watches', totalWatches],
    [],
    ['PER-CURRENCY TOTALS'],
    ['Currency','My Cost','Client Cost','Total Profit','Total Loss','Net P&L','My P&L','Client P&L','Expenses','Client Outstanding','My Outstanding'],
  ];
  if (currencies.length === 0) sumRows.push(['— no financial data —']);
  for (const c of currencies) {
    sumRows.push([ c, rnd(agg.myTotalCostByCur[c]), rnd(agg.clientTotalCostByCur[c]), rnd(agg.totalProfitByCur[c]),
                   rnd(agg.totalLossByCur[c]), rnd(agg.netPnlByCur[c]), rnd(agg.myPnlByCur[c]), rnd(agg.clientPnlByCur[c]),
                   rnd(agg.totalExpensesByCur[c]), rnd(agg.clientRemainingByCur[c]), rnd(agg.myRemainingByCur[c]) ]);
  }
  sumRows.push([], ['PER-MEMBERSHIP'], ...memRows);

  // ── Assemble workbook ──
  const wb = XLSX.utils.book_new();
  const wsSum = XLSX.utils.aoa_to_sheet(sumRows);
  wsSum['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 18 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, wsSum, 'Summary');

  const wsW = XLSX.utils.aoa_to_sheet(wRows);
  wsW['!cols'] = [{ wch: 16 },{ wch: 18 },{ wch: 14 },{ wch: 16 },{ wch: 22 },{ wch: 10 },{ wch: 10 },{ wch: 8 },{ wch: 12 },{ wch: 12 },{ wch: 13 },{ wch: 13 },{ wch: 10 },{ wch: 11 },{ wch: 14 },{ wch: 12 },{ wch: 11 },{ wch: 11 },{ wch: 11 },{ wch: 11 },{ wch: 11 },{ wch: 12 },{ wch: 14 },{ wch: 16 },{ wch: 10 },{ wch: 14 },{ wch: 12 },{ wch: 16 },{ wch: 16 }];
  XLSX.utils.book_append_sheet(wb, wsW, 'Watches');

  const wsT = XLSX.utils.aoa_to_sheet(tRows);
  wsT['!cols'] = [{ wch: 16 },{ wch: 16 },{ wch: 14 },{ wch: 12 },{ wch: 18 },{ wch: 12 },{ wch: 8 },{ wch: 30 },{ wch: 9 }];
  XLSX.utils.book_append_sheet(wb, wsT, 'Transactions');

  const safeName = (client.name || 'client').replace(/[^\w\- ]+/g, '').trim().slice(0, 40) || 'client';
  XLSX.writeFile(wb, `Meridian - ${safeName} - ${today}.xlsx`);
}

// Build a clean, theme-matched, print-to-PDF client statement. Opens a new
// tab with a styled report and auto-triggers the print dialog (Save as PDF).
// Everything is derived from _currentClientData / computePnl, so figures match
// the on-screen tiles. Empty blocks (shops with no watches, zero-value totals,
// missing fields) are omitted entirely.
