// 25-boutique-commission.js — Tools → Boutique Commission (master + admin)
// The owner's side of the boutique-manager feature. Pick one of your boutique
// managers: you see every piece at their shop with the commission currently
// shown to them, set a commission on an existing piece (recorded as a
// 'commission' expense flagged for_boutique, so it lands in their Commissions
// tab), share or hide commissions already recorded, or add a brand-new piece
// to the shop and set its commission in one go. Boutique managers never see
// this page (style.css hides the nav item; the API refuses them anyway).
// Part of the dashboard script: scripts/build.js concatenates src/dashboard/*.js
// in filename order into public/js/dashboard.js (one classic script, so
// functions and top-level variables stay shared exactly as before).

let _bcManagers = [];
let _bcManagerId = (() => { try { return Number(localStorage.getItem('meridian.bcManager')) || null; } catch { return null; } })();
let _bcShop = null;            // { id, name, profiles }
let _bcWatches = [];

function bcSelectedManager() { return _bcManagers.find(m => m.id === _bcManagerId) || _bcManagers[0] || null; }

async function loadBoutiqueCommission() {
  const sel = document.getElementById('bcManagerSelect');
  const empty = document.getElementById('bcEmpty');
  const content = document.getElementById('bcContent');
  try { _bcManagers = await api('GET', '/api/boutique-managers'); } catch (e) { _bcManagers = []; }

  if (!_bcManagers.length) {
    sel.innerHTML = `<option value="" style="background:#131A24;color:#E6EDF7">No boutique manager yet</option>`;
    content.classList.add('hidden');
    empty.classList.remove('hidden');
    empty.innerHTML = `
      <span class="material-symbols-outlined text-outline text-4xl block mb-3">storefront</span>
      <p class="text-on-surface font-semibold mb-1">No boutique manager in this workspace yet</p>
      <p>${currentUser?.role === 'master'
        ? `Create one under <button class="text-primary underline" onclick="showPage('admin'); setTimeout(() => showAdminTab('addUser'), 50)">Admin → Add User</button> with the role <strong class="text-on-surface">Boutique Manager</strong>, then come back here to decide what they see.`
        : 'Ask the master to create a boutique manager for one of your shops (Admin → Add User → Boutique Manager). Then you can decide here what they see.'}</p>`;
    return;
  }
  empty.classList.add('hidden');
  content.classList.remove('hidden');
  const chosen = bcSelectedManager();
  _bcManagerId = chosen.id;
  sel.innerHTML = _bcManagers.map(m =>
    `<option value="${m.id}" style="background:#131A24;color:#E6EDF7" ${m.id === _bcManagerId ? 'selected' : ''}>${esc(m.username)} · ${esc(m.shop_name || 'no shop assigned')}</option>`).join('');
  await loadBoutiqueCommissionShop();
}

document.getElementById('bcManagerSelect')?.addEventListener('change', e => {
  _bcManagerId = Number(e.target.value) || null;
  try { localStorage.setItem('meridian.bcManager', String(_bcManagerId || '')); } catch {}
  loadBoutiqueCommissionShop();
});

// Commission entries of a watch, newest first (voided ones are left out)
function bcCommissions(w) {
  return (w.expenses || []).filter(e => e.category === 'commission' && !e.reversed)
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.id - a.id);
}
function bcSum(list, pick = () => true) {
  const m = {};
  for (const e of list) if (pick(e)) m[e.currency || 'CHF'] = (m[e.currency || 'CHF'] || 0) + Number(e.amount || 0);
  return m;
}

async function loadBoutiqueCommissionShop() {
  const m = bcSelectedManager();
  const body = document.getElementById('bcBody');
  if (!m) return;
  if (!m.shop_id) {
    _bcShop = null; _bcWatches = [];
    document.getElementById('bcTiles').innerHTML = '';
    document.getElementById('bcShopTitle').textContent = 'No shop assigned';
    document.getElementById('bcShopSub').textContent = `${m.username} is not linked to a shop yet — assign one under Admin → Users (store icon).`;
    document.getElementById('bcNewClient').innerHTML = '';
    body.innerHTML = `<tr><td colspan="6" class="px-6 py-12 text-center text-on-surface-variant text-sm">Nothing to show until the manager has a shop.</td></tr>`;
    return;
  }
  const [shop, watches] = await Promise.all([
    api('GET', `/api/shops/${m.shop_id}`),
    api('GET', `/api/watches?shop_id=${m.shop_id}`),
  ]);
  _bcShop = shop; _bcWatches = watches;
  watches.forEach(w => { watchCache[w.id] = w; });

  // ── Tiles: what the boutique currently sees ──
  const all = watches.flatMap(bcCommissions);
  const shared = all.filter(e => e.for_boutique);
  const tile = (label, value, sub, cls = 'bm-commission') => `
    <div class="glass-surface rounded-lg p-5">
      <p class="text-[11px] uppercase tracking-[0.06em] text-on-surface-variant font-semibold mb-3">${label}</p>
      <p class="font-playfair text-2xl ${cls}">${value}</p>
      <p class="text-[11px] text-on-surface-variant mt-1">${sub}</p>
    </div>`;
  document.getElementById('bcTiles').innerHTML = [
    tile(`Shown to ${esc(m.username)}`, fmt.byCurrency(bcSum(shared)), `${shared.length} commission${shared.length !== 1 ? 's' : ''} shared · ${new Set(shared.map(e => e.watch_id)).size} piece${new Set(shared.map(e => e.watch_id)).size !== 1 ? 's' : ''}`),
    tile('Shared this month', fmt.byCurrency(bcSum(shared, e => isThisMonth(e.date))), new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })),
    tile('Kept private', fmt.byCurrency(bcSum(all.filter(e => !e.for_boutique))), `${all.length - shared.length} commission${all.length - shared.length !== 1 ? 's' : ''} recorded but not shown`, 'text-on-surface'),
  ].join('');

  document.getElementById('bcShopTitle').textContent = `Pieces at ${shop.name}`;
  document.getElementById('bcShopSub').textContent = `${watches.length} piece${watches.length !== 1 ? 's' : ''} · ${(shop.profiles || []).length} client${(shop.profiles || []).length !== 1 ? 's' : ''} · seen by ${m.username}`;

  // New piece: pick which client of the shop it belongs to
  const clientSel = document.getElementById('bcNewClient');
  const profiles = shop.profiles || [];
  clientSel.innerHTML = profiles.length
    ? profiles.map(p => `<option value="${p.id}" style="background:#131A24;color:#E6EDF7">${esc(p.name)}</option>`).join('')
    : `<option value="" style="background:#131A24;color:#E6EDF7">No clients at this shop yet</option>`;
  document.getElementById('bcNewPieceBtn').disabled = !profiles.length;
  document.getElementById('bcNewPieceBtn').classList.toggle('opacity-50', !profiles.length);

  // ── Pieces table: owned first, wishlist last ──
  const ordered = [...watches.filter(w => w.status !== 'wishlist'), ...watches.filter(w => w.status === 'wishlist')];
  body.innerHTML = ordered.length ? ordered.map(bcRowHtml).join('')
    : `<tr><td colspan="6" class="px-6 py-12 text-center text-on-surface-variant text-sm">No pieces at this shop yet — add one with "New piece for this shop".</td></tr>`;
}

function bcRowHtml(w) {
  const cur = w.currency || 'CHF';
  const comms = bcCommissions(w);
  const shared = comms.filter(e => e.for_boutique);
  const thumb = w.image_path
    ? `<img src="${w.image_path}" class="w-full h-full object-cover" alt="">`
    : `<span class="material-symbols-outlined text-outline text-[20px]">watch</span>`;
  const canSet = w.status !== 'wishlist';
  const entryRows = comms.map(e => `
    <div class="flex items-center gap-3 py-1.5">
      <span class="text-[11px] font-mono text-on-surface-variant w-20 flex-shrink-0">${fmt.date(e.date)}</span>
      <span class="flex-1 text-xs text-on-surface-variant truncate">${esc(e.description || 'Commission')}</span>
      ${e.for_boutique
        ? `<span class="text-[11px] font-semibold px-2 py-0.5 rounded bg-amber-400/10 text-amber-300 flex-shrink-0">Shown</span>`
        : `<span class="text-[11px] font-semibold px-2 py-0.5 rounded bg-white/[0.04] text-outline flex-shrink-0">Private</span>`}
      <span class="font-mono text-xs ${e.for_boutique ? 'bm-commission' : 'text-on-surface-variant'} flex-shrink-0 w-24 text-right">${fmt.price(e.amount, e.currency || cur)}</span>
      <button onclick="toggleExpenseBoutique(${e.id}, ${e.for_boutique ? 'false' : 'true'})" title="${e.for_boutique ? 'Hide from the boutique manager' : 'Show to the boutique manager'}" class="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border transition-all flex-shrink-0 ${e.for_boutique ? 'border-outline-variant/30 text-on-surface-variant hover:text-on-surface' : 'border-amber-400/30 text-amber-300 hover:bg-amber-400/10'}">${e.for_boutique ? 'Hide' : 'Show'}</button>
      <button onclick="reverseExpense(${e.id}, ${w.id})" title="Void this commission" class="p-1 text-on-surface-variant hover:text-error transition-colors flex-shrink-0">
        <span class="material-symbols-outlined text-[14px]">close</span>
      </button>
    </div>`).join('');
  return `
    <tr class="tbl-row">
      <td class="px-5 py-3">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-11 h-11 rounded-lg bg-surface-container border border-outline-variant/15 flex items-center justify-center flex-shrink-0 overflow-hidden">${thumb}</div>
          <div class="min-w-0">
            <button onclick="openWatchDetail(${w.id})" class="text-sm font-medium text-on-surface hover:text-primary transition-colors text-left truncate block">${esc(w.model)}</button>
            <p class="text-xs font-mono text-outline truncate">${esc(w.reference_number || '')}${w.stock_number ? ` · ${esc(w.stock_number)}` : ''}</p>
          </div>
        </div>
      </td>
      <td class="px-5 py-3 text-sm text-on-surface-variant">${esc(w.client_name || '—')}</td>
      <td class="px-5 py-3">${statusBadge(w.status)}</td>
      <td class="px-5 py-3 text-sm font-mono text-on-surface">${w.list_price != null ? fmt.price(w.list_price, cur) : '<span class="text-outline">—</span>'}</td>
      <td class="px-5 py-3">
        ${shared.length ? `<span class="font-mono text-sm font-semibold bm-commission">${fmt.byCurrency(bcSum(shared))}</span>` : `<span class="text-xs text-outline">nothing shown</span>`}
        ${comms.length > shared.length ? `<span class="block text-[11px] text-outline mt-0.5">${comms.length - shared.length} private</span>` : ''}
      </td>
      <td class="px-5 py-3 text-right">
        ${canSet
          ? `<button onclick="openBoutiqueCommissionModal(${w.id})" class="text-[11px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-lg border border-amber-400/30 text-amber-300 bg-amber-400/5 hover:bg-amber-400/15 transition-all inline-flex items-center gap-1.5">
              <span class="material-symbols-outlined text-[14px]">payments</span> Set commission
            </button>`
          : `<span class="text-[11px] text-outline" title="Commissions are recorded on bought pieces. Mark it purchased first.">wishlist · buy first</span>`}
      </td>
    </tr>
    ${comms.length ? `<tr><td colspan="6" class="px-5 pb-3 pt-0"><div class="ml-14 pl-4 border-l border-amber-400/20">${entryRows}</div></td></tr>` : ''}`;
}

// Set commission = the Add Expense dialog, preset to a commission that the
// boutique sees. Saving refreshes this page (submitExpense handles the page).
function openBoutiqueCommissionModal(watchId) {
  openAddExpenseModal(watchId);
  const m = bcSelectedManager();
  document.getElementById('expCategory').value = 'commission';
  syncExpenseBoutiqueOption();
  document.getElementById('expBoutique').checked = true;
  document.querySelector('#addExpenseModal h2').textContent = 'Set boutique commission';
  document.getElementById('expDescription').placeholder = `e.g. Allocation commission for ${m?.username || 'the boutique'}`;
}

// New piece for this shop: the standard Add Watch dialog for the chosen client,
// preset to Purchased (commissions need a bought piece). When it is saved the
// commission dialog opens for it right away (hook in 14-watch-modal.js).
document.getElementById('bcNewPieceBtn')?.addEventListener('click', async () => {
  const profileId = Number(document.getElementById('bcNewClient').value);
  if (!profileId) return;
  await openAddWatch(profileId);
  setWatchStatus('purchased');
  document.getElementById('wDate').value = new Date().toISOString().split('T')[0];
});
function onBoutiqueWatchCreated(w) {
  if (w.status === 'wishlist') return;    // nothing to set on a wishlist piece yet
  watchCache[w.id] = { ...w, client_name: _bcShop?.profiles?.find(p => p.id === w.profile_id)?.name };
  openBoutiqueCommissionModal(w.id);
}
