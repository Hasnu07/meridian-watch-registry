// 24-boutique-manager.js — the Boutique Manager role
// A boutique manager is a user a master creates for ONE shop of a registry.
// They have a workspace of their own — shops, clients, watches, exactly as an
// admin — and, on top, a VIEW-ONLY window onto the shop they manage in their
// owner's registry: opened from the Shops page's "Boutique Manager Shops"
// (the shop page with its clients and pieces, every control hidden) or the
// Commissions tab (the commissions the owner shares with them). While that
// window is open (bmShopView, 01-core.js) every request carries
// X-Boutique-Shop and routes/boutique.js answers it stripped down: no stock
// numbers, resale prices, costs, payouts, split rules; a piece is "wishlist"
// or "handed over". public/style.css: `html.is-bm` all session (hides the
// owner-side Boutique Commission page), `html.role-bm` while in the window
// (hides every control). Nothing here runs for other roles.
// Part of the dashboard script: scripts/build.js concatenates src/dashboard/*.js
// in filename order into public/js/dashboard.js (one classic script, so
// functions and top-level variables stay shared exactly as before).

function isBoutiqueManager() { return currentUser?.role === 'boutique_manager'; }
function bmShopName() { return currentUser?.shop?.name || 'the shop you manage'; }

// Called from refreshCurrentUser() every time the session user is (re)loaded
function applyRoleUi(user) {
  const bm = user?.role === 'boutique_manager';
  document.documentElement.classList.toggle('is-bm', bm);
  if (!bm) setBmView(false);

  const roleLabel = document.getElementById('currentUserRoleLabel');
  if (roleLabel) roleLabel.textContent = bm ? `Boutique Manager · ${user.shop?.name || 'no shop yet'}` : 'Signed in as';

  // Tools → Commissions: the commissions shared with them on the managed shop
  const nav = document.getElementById('navCommissions');
  if (nav) { nav.classList.toggle('hidden', !bm); nav.classList.toggle('flex', bm); }
}

// The shop they manage, view-only: the shop page under the boutique view
function openBoutiqueShop() {
  if (!isBoutiqueManager() || !currentUser?.shop) return;
  setBmView(true);
  openShopDetail(currentUser.shop.id);
}

// ── Series helpers ─────────────────────────────────────────────────────────

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

// ── Commissions page (Tools → Commissions) ─────────────────────────────────
// Every commission the owner chose to share, newest first, grouped by month.
// The data is the same `expenses` list the watches already carry.

async function loadCommissions() {
  const body = document.getElementById('commissionsBody');
  if (!isBoutiqueManager() || !currentUser?.shop) {
    document.getElementById('commissionTiles').innerHTML = '';
    body.innerHTML = `<tr><td colspan="6" class="px-6 py-16 text-center text-on-surface-variant text-sm">${isBoutiqueManager() ? 'You are not linked to a shop yet — ask the registry owner.' : 'This page is for boutique manager accounts.'}</td></tr>`;
    return;
  }
  setBmView(true);   // the managed shop's pieces, as the owner shares them
  document.getElementById('commissionsSubtitle').textContent = `Commission set for you on pieces at ${bmShopName()} (${currentUser.shop.owner_username || 'the owner'}'s registry). The owner chooses which commissions appear here.`;
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

// ── Watch page ─────────────────────────────────────────────────────────────
// A plain page for a piece of the MANAGED shop (bmShopView): the piece, its
// identity, the commission on it and the client. Their own watches use the
// normal page.

const _bmRenderWatchDetailPage = renderWatchDetailPage;
renderWatchDetailPage = function (w) {
  if (!bmShopView) return _bmRenderWatchDetailPage(w);

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
