// 25-boutique-commission.js — Tools → Boutique Commission (master + admin)
// The owner's side of the boutique-manager feature. Pick one of your boutique
// managers: you see every piece at their shop with the commission currently
// shown to them, set a commission on an existing piece (recorded as a
// 'commission' expense flagged for_boutique, so it lands in their Commissions
// tab), share or hide commissions already recorded, or add a brand-new piece
// to the shop and set its commission in one go. Boutique managers never see
// this page (style.css hides the nav item; the API refuses them anyway).
//
// Collaborators (routes/collab.js): the owner names colleagues — other admin
// or master accounts — on a shop here, in the Collaborators card. The picker
// then also lists, for a colleague, the shops OTHER registries shared with
// them ("Shops shared with you"); choosing one sets the collaborator context
// (setCollabShop, 01-core.js) so every request is scoped to that shop, and
// they can view its pieces, add or edit a piece and set commissions exactly as
// the owner does here — nothing else.
// Part of the dashboard script: scripts/build.js concatenates src/dashboard/*.js
// in filename order into public/js/dashboard.js (one classic script, so
// functions and top-level variables stay shared exactly as before).

let _bcManagers = [];          // boutique managers of this workspace
let _bcShared = [];            // shops of other registries shared with me (collaborations)
let _bcChoice = (() => { try { return localStorage.getItem('meridian.bcChoice') || ''; } catch { return ''; } })();
let _bcShop = null;            // { id, name, profiles }
let _bcWatches = [];
let _bcCollaborators = [];     // of the chosen shop
let _bcUserNames = null;       // master only: usernames for the collaborator picker

// The picker: one choice per boutique manager of this workspace, one per shop shared with me
function bcChoices() {
  return [
    ..._bcManagers.map(m => ({ key: `m:${m.id}`, kind: 'manager', shop_id: m.shop_id, shop_name: m.shop_name,
                               managers: m.username, label: `${m.username} · ${m.shop_name || 'no shop assigned'}` })),
    ..._bcShared.map(c => ({ key: `c:${c.shop_id}`, kind: 'collab', shop_id: c.shop_id, shop_name: c.shop_name,
                             owner_id: c.owner_id, owner_username: c.owner_username, managers: c.managers || '',
                             label: `${c.shop_name} · ${c.owner_username}'s registry` })),
  ];
}
function bcSelected() {
  const all = bcChoices();
  return all.find(c => c.key === _bcChoice) || all[0] || null;
}
// For the callers that think in managers (the commission dialog's wording)
function bcSelectedManager() {
  const c = bcSelected();
  return c ? { username: c.managers || 'the boutique', shop_id: c.shop_id } : null;
}

async function loadBoutiqueCommission() {
  const sel = document.getElementById('bcManagerSelect');
  const empty = document.getElementById('bcEmpty');
  const content = document.getElementById('bcContent');
  // The picker is about OUR workspace: never ask for it under a shared shop's scope
  setCollabShop(null);
  [_bcManagers, _bcShared] = await Promise.all([
    api('GET', '/api/boutique-managers').catch(() => []),
    api('GET', '/api/collab/shops').catch(() => []),
  ]);

  const choices = bcChoices();
  if (!choices.length) {
    sel.innerHTML = `<option value="" style="background:#131A24;color:#E6EDF7">No boutique manager yet</option>`;
    content.classList.add('hidden');
    empty.classList.remove('hidden');
    empty.innerHTML = `
      <span class="material-symbols-outlined text-outline text-4xl block mb-3">storefront</span>
      <p class="text-on-surface font-semibold mb-1">No boutique manager in this workspace yet</p>
      <p>${currentUser?.role === 'master'
        ? `Create one under <button class="text-primary underline" onclick="showPage('admin'); setTimeout(() => showAdminTab('addUser'), 50)">Admin → Add User</button> with the role <strong class="text-on-surface">Boutique Manager</strong>, then come back here to decide what they see.`
        : 'Ask the master to create a boutique manager for one of your shops (Admin → Add User → Boutique Manager). Then you can decide here what they see.'}</p>
      <p class="mt-3 text-xs">A shop a colleague shares with you as a collaborator appears here too.</p>`;
    return;
  }
  empty.classList.add('hidden');
  content.classList.remove('hidden');
  const chosen = bcSelected();
  _bcChoice = chosen.key;
  const opt = c => `<option value="${c.key}" style="background:#131A24;color:#E6EDF7">${esc(c.label)}</option>`;
  const own = choices.filter(c => c.kind === 'manager'), shared = choices.filter(c => c.kind === 'collab');
  sel.innerHTML =
    (own.length    ? `<optgroup label="Your boutique managers" style="background:#131A24;color:#8A96A8">${own.map(opt).join('')}</optgroup>` : '') +
    (shared.length ? `<optgroup label="Shops shared with you" style="background:#131A24;color:#8A96A8">${shared.map(opt).join('')}</optgroup>` : '');
  sel.value = chosen.key;
  await loadBoutiqueCommissionShop();
}

document.getElementById('bcManagerSelect')?.addEventListener('change', e => {
  _bcChoice = e.target.value || '';
  try { localStorage.setItem('meridian.bcChoice', _bcChoice); } catch {}
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
  const c = bcSelected();
  const body = document.getElementById('bcBody');
  if (!c) return;
  const inCollab = c.kind === 'collab';
  // Every request from here on is scoped to the shared shop (or to our own workspace)
  setCollabShop(inCollab ? { id: c.shop_id, name: c.shop_name, owner_username: c.owner_username } : null);
  const ctx = document.getElementById('bcContext');
  ctx.classList.toggle('hidden', !inCollab);
  ctx.classList.toggle('flex', inCollab);
  if (inCollab) ctx.innerHTML = `
    <span class="material-symbols-outlined text-primary text-[20px]">group</span>
    <span class="flex-1 min-w-0"><strong class="font-semibold">${esc(c.shop_name)}</strong> is ${esc(c.owner_username)}'s shop, shared with you.
      You can see its clients and pieces, add a client or a piece, edit or remove a piece and set commissions — ${esc(c.owner_username)} and the boutique manager see it at once.</span>`;

  const managerNames = c.managers || '';
  if (!c.shop_id) {
    _bcShop = null; _bcWatches = []; _bcCollaborators = [];
    document.getElementById('bcTiles').innerHTML = '';
    document.getElementById('bcShopTitle').textContent = 'No shop assigned';
    document.getElementById('bcShopSub').textContent = `${managerNames} is not linked to a shop yet — assign one under Admin → Users (store icon).`;
    document.getElementById('bcNewClient').innerHTML = '';
    document.getElementById('bcCollab').innerHTML = '';
    body.innerHTML = `<tr><td colspan="5" class="px-6 py-12 text-center text-on-surface-variant text-sm">Nothing to show until the manager has a shop.</td></tr>`;
    return;
  }
  const [shop, watches, collaborators] = await Promise.all([
    api('GET', `/api/shops/${c.shop_id}`),
    api('GET', `/api/watches?shop_id=${c.shop_id}`),
    api('GET', `/api/shops/${c.shop_id}/collaborators`).catch(() => []),
  ]);
  _bcShop = shop; _bcWatches = watches; _bcCollaborators = collaborators;
  watches.forEach(w => { watchCache[w.id] = w; });

  // ── Tiles: the balance with the boutique — total shown, paid out, still pending ──
  const all = watches.flatMap(bcCommissions);
  const shared = all.filter(e => e.for_boutique);
  const paid = shared.filter(e => e.paid_at), pending = shared.filter(e => !e.paid_at);
  const tile = (label, value, sub, cls = 'bm-commission') => `
    <div class="glass-surface rounded-lg p-5">
      <p class="text-[11px] uppercase tracking-[0.06em] text-on-surface-variant font-semibold mb-3">${label}</p>
      <p class="font-playfair text-2xl ${cls}">${value}</p>
      <p class="text-[11px] text-on-surface-variant mt-1">${sub}</p>
    </div>`;
  const seenBy = managerNames ? esc(managerNames) : 'the boutique';
  const n = (list, word = 'commission') => `${list.length} ${word}${list.length !== 1 ? 's' : ''}`;
  const monthName = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  // Wishlist pending: pieces clients are waiting for — no commission until handed over
  const wish = watches.filter(w => w.status === 'wishlist');
  const longest = wish.reduce((mx, w) => Math.max(mx, wishlistDays(w) ?? 0), 0);
  const waiting30 = wish.filter(w => (wishlistDays(w) ?? 0) >= 30).length;
  document.getElementById('bcTiles').innerHTML = [
    tile(`Total balance · shown to ${seenBy}`, fmt.byCurrency(bcSum(shared)), `${n(shared)} · ${new Set(shared.map(e => e.watch_id)).size} piece${new Set(shared.map(e => e.watch_id)).size !== 1 ? 's' : ''} · ${fmt.byCurrency(bcSum(shared, e => isThisMonth(e.date)))} in ${monthName}`),
    tile('Paid', fmt.byCurrency(bcSum(paid)), `${n(paid)} paid out to ${seenBy}`, 'text-emerald-400'),
    tile('Commission left', fmt.byCurrency(bcSum(pending)), `${n(pending)} still to pay ${seenBy}`, pending.length ? 'bm-commission' : 'text-on-surface'),
    tile('Kept private', fmt.byCurrency(bcSum(all.filter(e => !e.for_boutique))), `${n(all.filter(e => !e.for_boutique))} recorded but not shown`, 'text-on-surface'),
    tile('Wishlist pending', `<span class="${wish.length ? 'text-amber-300' : 'text-on-surface'}">${wish.length}<span class="text-sm text-on-surface-variant font-sans font-medium ml-1">${wish.length === 1 ? 'piece' : 'pieces'}</span></span>`,
         wish.length ? `not bought yet · longest wait ${longest} day${longest !== 1 ? 's' : ''}${waiting30 ? ` · ${waiting30} over 30 days` : ''}` : 'nothing waiting at the shop'),
  ].join('');

  document.getElementById('bcShopTitle').textContent = `Pieces at ${shop.name}`;
  document.getElementById('bcShopSub').textContent =
    `${watches.length} piece${watches.length !== 1 ? 's' : ''} · ${(shop.profiles || []).length} client${(shop.profiles || []).length !== 1 ? 's' : ''}`
    + ` · seen by ${managerNames || 'no boutique manager yet'}`
    + (inCollab ? ` · ${c.owner_username}'s registry` : '');

  // New piece: pick which client of the shop it belongs to
  const clientSel = document.getElementById('bcNewClient');
  const profiles = shop.profiles || [];
  clientSel.innerHTML = profiles.length
    ? profiles.map(p => `<option value="${p.id}" style="background:#131A24;color:#E6EDF7">${esc(p.name)}</option>`).join('')
    : `<option value="" style="background:#131A24;color:#E6EDF7">No clients at this shop yet</option>`;
  document.getElementById('bcNewPieceBtn').disabled = !profiles.length;
  document.getElementById('bcNewPieceBtn').classList.toggle('opacity-50', !profiles.length);

  renderBcCollaborators(c);

  // ── Pieces table: one block per client — their bought pieces first, then their wishlist ──
  body.innerHTML = watches.length ? bcGroupsHtml(watches, profiles)
    : `<tr><td colspan="5" class="px-6 py-12 text-center text-on-surface-variant text-sm">No pieces at this shop yet — add one with "New piece for this shop".</td></tr>`;
}

// Group the shop's pieces by client so each person reads as one block: a
// header row with the client's name, how many pieces they bought and have on
// their wishlist, the list-price total and the commission shown to the
// boutique, then their purchased pieces, then their wishlist pieces. Clients
// with pieces are ordered by name; a client of the shop with no piece yet is
// listed at the end so they are not forgotten when new pieces come in.
function bcGroupsHtml(watches, profiles) {
  const groups = new Map();
  const keyOf = w => w.profile_id ?? `name:${w.client_name || ''}`;
  for (const w of watches) {
    const k = keyOf(w);
    if (!groups.has(k)) groups.set(k, { name: w.client_name || '—', watches: [] });
    groups.get(k).watches.push(w);
  }
  const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  const withPieces = [...groups.values()].sort(byName);
  const without = (profiles || []).filter(p => !groups.has(p.id)).map(p => ({ name: p.name, watches: [] })).sort(byName);

  return [...withPieces, ...without].map(g => {
    const owned = g.watches.filter(w => w.status !== 'wishlist');
    const wish  = g.watches.filter(w => w.status === 'wishlist');
    const listTotal = {};
    for (const w of owned) if (w.list_price != null) listTotal[w.currency || 'CHF'] = (listTotal[w.currency || 'CHF'] || 0) + Number(w.list_price);
    const shared = g.watches.flatMap(bcCommissions).filter(e => e.for_boutique);
    const header = `
      <tr class="bc-client-row">
        <td colspan="5" class="!py-2.5 !px-5">
          <div class="flex items-center gap-4 flex-wrap">
            <span class="inline-flex items-center gap-2 text-sm font-semibold text-on-surface">
              <span class="w-6 h-6 rounded-full bg-primary/15 text-primary text-[11px] font-semibold uppercase flex items-center justify-center">${esc((g.name || '?')[0])}</span>
              ${esc(g.name)}
            </span>
            <span class="text-[11px] font-mono text-on-surface-variant">${g.watches.length} piece${g.watches.length !== 1 ? 's' : ''}</span>
            ${owned.length ? `<span class="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-purple-300"><span class="w-1.5 h-1.5 rounded-full bg-purple-400 inline-block"></span>${owned.length} purchased</span>` : ''}
            ${wish.length  ? `<span class="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-amber-300"><span class="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block"></span>${wish.length} wishlist</span>` : ''}
            <span class="ml-auto flex items-center gap-5 text-[11px] text-on-surface-variant">
              ${owned.length ? `<span>List <span class="font-mono text-on-surface">${fmt.byCurrency(listTotal)}</span></span>` : ''}
              ${shared.length ? `<span>Shown <span class="font-mono font-semibold bm-commission">${fmt.byCurrency(bcSum(shared))}</span></span>` : `<span class="text-outline">nothing shown</span>`}
              ${shared.some(e => e.paid_at) ? `<span>Paid <span class="font-mono font-semibold text-emerald-400">${fmt.byCurrency(bcSum(shared, e => e.paid_at))}</span></span>` : ''}
              ${shared.some(e => !e.paid_at) ? `<span>Pending <span class="font-mono font-semibold text-on-surface">${fmt.byCurrency(bcSum(shared, e => !e.paid_at))}</span></span>` : ''}
            </span>
          </div>
        </td>
      </tr>`;
    const rows = g.watches.length
      ? [...owned, ...wish].map(bcRowHtml).join('')
      : `<tr><td colspan="5" class="px-5 py-3 pl-[4.5rem] text-xs text-outline">No piece yet — add one with "New piece for this shop".</td></tr>`;
    return header + rows;
  }).join('');
}

// ── Collaborators card ─────────────────────────────────────────────────────
// Owner: the colleagues working this shop with you, remove one, add one by
// username (a master gets the usernames to pick from). Collaborator: who
// shared it and who else works on it — read-only.
function renderBcCollaborators(c) {
  const el = document.getElementById('bcCollab');
  const list = _bcCollaborators || [];
  const chip = u => `
    <span class="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full border border-primary/30 bg-primary/5 text-sm text-on-surface">
      <span class="w-5 h-5 rounded-full bg-primary/15 text-primary text-[10px] font-semibold uppercase flex items-center justify-center">${esc(u.username[0])}</span>
      ${esc(u.username)}
      ${c.kind === 'manager' ? `<button onclick="removeBcCollaborator(${u.user_id}, '${esc(u.username).replace(/'/g, "\\'")}')" title="Remove ${esc(u.username)} from this shop" class="w-5 h-5 rounded-full flex items-center justify-center text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors">
          <span class="material-symbols-outlined text-[14px]">close</span></button>` : ''}
    </span>`;

  if (c.kind === 'collab') {
    const others = list.filter(u => u.user_id !== currentUser?.id);
    el.innerHTML = `
      <div class="flex items-center gap-4 flex-wrap">
        <div class="min-w-0">
          <p class="text-[11px] uppercase tracking-[0.06em] text-on-surface-variant font-semibold">Collaborators</p>
          <p class="text-xs text-on-surface-variant mt-0.5">Shared with you by <strong class="text-on-surface">${esc(c.owner_username)}</strong>${others.length ? ' · also working on it:' : ' · nobody else works on it yet'}</p>
        </div>
        <div class="flex items-center gap-2 flex-wrap">${others.map(chip).join('')}</div>
      </div>`;
    return;
  }

  el.innerHTML = `
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <div class="min-w-0">
        <p class="text-[11px] uppercase tracking-[0.06em] text-on-surface-variant font-semibold">Collaborators</p>
        <p class="text-xs text-on-surface-variant mt-0.5">${list.length
          ? `Working on <strong class="text-on-surface">${esc(c.shop_name)}</strong> with you: they can see its clients and pieces, add, edit or remove a piece and set commissions from their own sign-in.`
          : `Nobody else works on <strong class="text-on-surface">${esc(c.shop_name)}</strong> yet. Add a colleague by username — they can then see its clients and pieces, add, edit or remove a piece and set commissions from their own sign-in.`}</p>
        ${list.length ? `<div class="flex items-center gap-2 flex-wrap mt-3">${list.map(chip).join('')}</div>` : ''}
      </div>
      <form id="bcCollabForm" class="flex items-center gap-2" onsubmit="addBcCollaborator(event)">
        <input id="bcCollabName" list="bcCollabNames" autocomplete="off" placeholder="username" aria-label="Username of the colleague to add"
               class="w-44 bg-surface-container-lowest border border-outline-variant/40 rounded-lg px-3 py-2 text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-primary transition-all">
        <datalist id="bcCollabNames"></datalist>
        <button type="submit" class="text-xs font-semibold px-3.5 py-2.5 rounded-lg border border-primary/40 text-primary hover:bg-primary/10 active:scale-95 transition-all flex items-center gap-1.5 whitespace-nowrap">
          <span class="material-symbols-outlined text-[16px]">person_add</span> Add collaborator
        </button>
      </form>
    </div>
    <p id="bcCollabError" class="hidden text-xs text-error mt-2"></p>`;
  fillBcCollaboratorNames();
}

// A master can see every account: offer the admins/masters not yet on the shop
async function fillBcCollaboratorNames() {
  if (currentUser?.role !== 'master') return;
  if (!_bcUserNames) {
    try { _bcUserNames = (await api('GET', '/api/admin/users')).filter(u => u.role !== 'boutique_manager').map(u => ({ id: u.id, username: u.username })); }
    catch { _bcUserNames = []; }
  }
  const dl = document.getElementById('bcCollabNames');
  if (!dl) return;
  const owner = currentUser?.viewing_as?.id || currentUser?.id;
  const taken = new Set((_bcCollaborators || []).map(u => u.user_id));
  dl.innerHTML = _bcUserNames.filter(u => u.id !== owner && !taken.has(u.id)).map(u => `<option value="${esc(u.username)}"></option>`).join('');
}

async function addBcCollaborator(ev) {
  ev?.preventDefault?.();
  const c = bcSelected();
  const input = document.getElementById('bcCollabName');
  const err = document.getElementById('bcCollabError');
  const username = (input?.value || '').trim();
  if (!c?.shop_id || !username) { input?.focus(); return; }
  err.classList.add('hidden');
  try {
    _bcCollaborators = await api('POST', `/api/shops/${c.shop_id}/collaborators`, { username });
    renderBcCollaborators(c);
  } catch (e) { err.textContent = e.message; err.classList.remove('hidden'); }
}

async function removeBcCollaborator(userId, username) {
  const c = bcSelected();
  if (!c?.shop_id) return;
  if (!confirm(`Remove ${username} from ${c.shop_name}? They will no longer see this shop.`)) return;
  try {
    _bcCollaborators = await api('DELETE', `/api/shops/${c.shop_id}/collaborators/${userId}`);
    renderBcCollaborators(c);
  } catch (e) { alert(e.message); }
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
      ${expensePaidBadge(e)}
      ${e.for_boutique
        ? `<span class="text-[11px] font-semibold px-2 py-0.5 rounded bg-amber-400/10 text-amber-300 flex-shrink-0">Shown</span>`
        : `<span class="text-[11px] font-semibold px-2 py-0.5 rounded bg-white/[0.04] text-outline flex-shrink-0">Private</span>`}
      <span class="font-mono text-xs ${e.for_boutique ? 'bm-commission' : 'text-on-surface-variant'} flex-shrink-0 w-24 text-right">${fmt.price(e.amount, e.currency || cur)}</span>
      <button onclick="toggleExpensePaid(${e.id}, ${e.paid_at ? 'false' : 'true'})" title="${e.paid_at ? `Paid ${fmt.date(e.paid_at)} — click to set back to pending` : 'Mark this commission as paid out'}" class="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border transition-all flex-shrink-0 ${e.paid_at ? 'border-outline-variant/30 text-on-surface-variant hover:text-on-surface' : 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10'}">${e.paid_at ? 'Unpaid' : 'Mark paid'}</button>
      <button onclick="toggleExpenseBoutique(${e.id}, ${e.for_boutique ? 'false' : 'true'})" title="${e.for_boutique ? 'Hide from the boutique manager' : 'Show to the boutique manager'}" class="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border transition-all flex-shrink-0 ${e.for_boutique ? 'border-outline-variant/30 text-on-surface-variant hover:text-on-surface' : 'border-amber-400/30 text-amber-300 hover:bg-amber-400/10'}">${e.for_boutique ? 'Hide' : 'Show'}</button>
      <button onclick="openEditExpenseModal(${e.id}, ${w.id})" title="Edit this commission" aria-label="Edit this commission" class="p-1 text-on-surface-variant hover:text-primary transition-colors flex-shrink-0">
        <span class="material-symbols-outlined text-[14px]">edit</span>
      </button>
      <button onclick="reverseExpense(${e.id}, ${w.id})" title="Void this commission" class="p-1 text-on-surface-variant hover:text-error transition-colors flex-shrink-0">
        <span class="material-symbols-outlined text-[14px]">close</span>
      </button>
    </div>`).join('');
  return `
    <tr class="tbl-row">
      <td class="pl-9 pr-5 py-3">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-11 h-11 rounded-lg bg-surface-container border border-outline-variant/15 flex items-center justify-center flex-shrink-0 overflow-hidden">${thumb}</div>
          <div class="min-w-0">
            <button onclick="openWatchDetail(${w.id})" class="text-sm font-medium text-on-surface hover:text-primary transition-colors text-left truncate block">${esc(w.model)}</button>
            <p class="text-xs font-mono text-outline truncate">${esc(w.reference_number || '')}${w.stock_number ? ` · ${esc(w.stock_number)}` : ''}</p>
          </div>
        </div>
      </td>
      <td class="px-5 py-3">${statusBadge(w.status)}</td>
      <td class="px-5 py-3 text-sm font-mono text-on-surface">${w.list_price != null ? fmt.price(w.list_price, cur) : '<span class="text-outline">—</span>'}</td>
      <td class="px-5 py-3">
        ${shared.length ? `<span class="font-mono text-sm font-semibold bm-commission">${fmt.byCurrency(bcSum(shared))}</span>` : `<span class="text-xs text-outline">nothing shown</span>`}
        ${shared.length ? (shared.every(e => e.paid_at)
            ? `<span class="block text-[11px] text-emerald-400 mt-0.5">paid</span>`
            : `<span class="block text-[11px] text-on-surface-variant mt-0.5">${fmt.byCurrency(bcSum(shared, e => !e.paid_at))} pending</span>`) : ''}
        ${comms.length > shared.length ? `<span class="block text-[11px] text-outline mt-0.5">${comms.length - shared.length} private</span>` : ''}
      </td>
      <td class="px-5 py-3 text-right whitespace-nowrap">
        ${canSet
          ? `<button onclick="openBoutiqueCommissionModal(${w.id})" class="text-[11px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-lg border border-amber-400/30 text-amber-300 bg-amber-400/5 hover:bg-amber-400/15 transition-all inline-flex items-center gap-1.5">
              <span class="material-symbols-outlined text-[14px]">payments</span> Set commission
            </button>`
          : `<span class="text-[11px] text-outline" title="Commissions are recorded on bought pieces. Mark it purchased first.">wishlist · buy first</span>`}
        <button onclick="openEditWatch(${w.id})" title="Edit piece" aria-label="Edit piece" class="p-1.5 ml-1 rounded-lg hover:bg-surface-variant/30 text-on-surface-variant hover:text-primary transition-colors align-middle">
          <span class="material-symbols-outlined text-[16px]">edit</span>
        </button>
        <button onclick="confirmDeleteWatch(${w.id}, '${esc(w.model).replace(/'/g, "\\'")}')" title="Remove piece" aria-label="Remove piece" class="p-1.5 rounded-lg hover:bg-error/10 text-on-surface-variant hover:text-error transition-colors align-middle">
          <span class="material-symbols-outlined text-[16px]">delete</span>
        </button>
      </td>
    </tr>
    ${comms.length ? `<tr><td colspan="5" class="px-5 pb-3 pt-0"><div class="ml-14 pl-4 border-l border-amber-400/20">${entryRows}</div></td></tr>` : ''}`;
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
