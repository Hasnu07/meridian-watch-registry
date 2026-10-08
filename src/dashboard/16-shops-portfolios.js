// 16-shops-portfolios.js — Shops, shop detail, portfolio detail + modal
// Part of the dashboard script: scripts/build.js concatenates src/dashboard/*.js
// in filename order into public/js/dashboard.js (one classic script, so
// functions and top-level variables stay shared exactly as before).

// ── Shops ──────────────────────────────────────────────────────────────────

let _shopsCache = { shops: [], portfolioCounts: [] };

async function loadShops() {
  const shops = await api('GET', '/api/shops');
  const portfoliosPerShop = await Promise.all(shops.map(s => api('GET', `/api/portfolios?shop_id=${s.id}`)));
  _shopsCache = { shops, portfolioCounts: portfoliosPerShop.map(p => p.length) };
  renderShops();
}

function shopRowHtml(shop, i) {
  const n = _shopsCache.portfolioCounts[i];
  const addr = (shop.address || '').split(/\n+/).map(x => x.trim()).filter(Boolean).join(', ');
  return `
    <div class="tbl-row grid grid-cols-[minmax(0,1fr)_110px_110px_auto] items-center gap-4 px-5 py-3 cursor-pointer group" onclick="openShopDetail(${shop.id})">
      <div class="flex items-center gap-3 min-w-0">
        <div class="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
          <span class="material-symbols-outlined text-primary text-[18px]">store</span>
        </div>
        <div class="min-w-0">
          <p class="text-sm font-semibold text-on-surface truncate">${esc(shop.name)}</p>
          <p class="text-xs text-on-surface-variant truncate">${esc(addr) || '—'}</p>
        </div>
      </div>
      <p class="font-mono text-sm text-on-surface">${n}</p>
      <p class="font-mono text-sm text-on-surface">${shop.client_count}</p>
      <div class="flex gap-0.5 justify-end">
        <button onclick="event.stopPropagation(); downloadShopPdf(${shop.id})" title="PDF report" aria-label="PDF report" class="${CARD_ICON_BTN}">
          <span class="material-symbols-outlined text-[18px]">picture_as_pdf</span>
        </button>
        <button onclick="event.stopPropagation(); openEditShop(${shop.id})" title="Edit" aria-label="Edit shop" class="${CARD_ICON_BTN}">
          <span class="material-symbols-outlined text-[18px]">edit</span>
        </button>
        <button onclick="event.stopPropagation(); confirmDeleteShop(${shop.id},'${esc(shop.name).replace(/'/g,"\\'")}')" title="Delete" aria-label="Delete shop" class="p-2 rounded-lg hover:bg-error/10 text-on-surface-variant hover:text-error transition-colors">
          <span class="material-symbols-outlined text-[18px]">delete</span>
        </button>
      </div>
    </div>`;
}

function renderShops() {
  const { shops, portfolioCounts } = _shopsCache;
  const grid = document.getElementById('shopsGrid');
  // Sort an index list so each shop keeps its portfolio count
  const [sortKey, sortDir] = getSort('shops').split(':');
  const SHOP_SORT = { name: i => shops[i].name || '', portfolios: i => portfolioCounts[i], clients: i => shops[i].client_count ?? 0 };
  const order = sortByKey(shops.map((_, i) => i), SHOP_SORT[sortKey] || SHOP_SORT.name, sortDir);
  if (getView('shops') === 'list') {
    grid.className = 'glass-surface rounded-lg overflow-hidden divide-y divide-white/[0.04]';
    grid.innerHTML = shops.length
      ? `<div class="grid grid-cols-[minmax(0,1fr)_110px_110px_auto] gap-4 px-5 py-3 bg-surface-container-low">
           <button type="button" class="sort-th" data-sort-scope="shops" data-sort-key="name">Shop<span class="material-symbols-outlined sort-icon">unfold_more</span></button><button type="button" class="sort-th" data-sort-scope="shops" data-sort-key="portfolios">Portfolios<span class="material-symbols-outlined sort-icon">unfold_more</span></button><button type="button" class="sort-th" data-sort-scope="shops" data-sort-key="clients">Clients<span class="material-symbols-outlined sort-icon">unfold_more</span></button><p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-on-surface-variant w-[108px]"></p>
         </div>` + order.map(i => shopRowHtml(shops[i], i)).join('')
      : `<div class="p-12 text-center text-on-surface-variant text-sm">No shops configured yet.</div>`;
    syncSortControls('shops');
    return;
  }
  grid.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4';
  grid.innerHTML = shops.length ? order.map(i => [shops[i], i]).map(([shop, i]) => `
    <div class="glass-surface rounded-lg p-6 hover:border-primary/20 border border-transparent transition-all cursor-pointer group"
         onclick="openShopDetail(${shop.id})">
      <div class="flex items-start justify-between mb-4">
        <div class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          <span class="material-symbols-outlined text-primary">store</span>
        </div>
        <div class="flex gap-1 opacity-60 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <button onclick="event.stopPropagation(); downloadShopPdf(${shop.id})"
                  class="p-1.5 rounded-lg hover:bg-primary/10 text-on-surface-variant hover:text-primary transition-colors" title="PDF report">
            <span class="material-symbols-outlined text-[16px]">picture_as_pdf</span>
          </button>
          <button onclick="event.stopPropagation(); openEditShop(${shop.id})"
                  class="p-1.5 rounded-lg hover:bg-surface-variant/30 text-on-surface-variant hover:text-primary transition-colors" title="Edit">
            <span class="material-symbols-outlined text-[16px]">edit</span>
          </button>
          <button onclick="event.stopPropagation(); confirmDeleteShop(${shop.id},'${esc(shop.name).replace(/'/g,"\\'")}')"
                  class="p-1.5 rounded-lg hover:bg-error/10 text-on-surface-variant hover:text-error transition-colors" title="Delete">
            <span class="material-symbols-outlined text-[16px]">delete</span>
          </button>
        </div>
      </div>
      <h3 class="font-playfair text-lg font-semibold text-on-surface mb-1">${esc(shop.name)}</h3>
      <p class="text-xs text-on-surface-variant leading-relaxed mb-4 whitespace-pre-line min-h-[2.5rem]">${esc(shop.address || '')}</p>
      <div class="flex items-center gap-4 pt-4 border-t border-outline-variant/10">
        <div class="flex items-center gap-1.5">
          <span class="material-symbols-outlined text-primary text-[16px]">folder_special</span>
          <span class="text-sm text-on-surface-variant">${portfolioCounts[i]} portfolio${portfolioCounts[i] !== 1 ? 's' : ''}</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="material-symbols-outlined text-primary text-[16px]">group</span>
          <span class="text-sm text-on-surface-variant">${shop.client_count} client${shop.client_count !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </div>
  `).join('') : `<div class="col-span-3 glass-surface rounded-lg p-12 text-center text-on-surface-variant text-sm">No shops configured yet.</div>`;
}

async function loadAllPortfolios() {
  const shops = await api('GET', '/api/shops');
  const allPortfolios = (await Promise.all(shops.map(s => api('GET', `/api/portfolios?shop_id=${s.id}`)))).flat();
  const shopMap = {};
  shops.forEach(s => { shopMap[s.id] = s.name; });
  _portfoliosCache = { allPortfolios, shopMap };
  renderAllPortfolios();
}

let _portfoliosCache = { allPortfolios: [], shopMap: {} };

function portfolioRowHtml(pt) {
  const { shopMap } = _portfoliosCache;
  return `
    <div class="tbl-row grid grid-cols-[minmax(0,1fr)_minmax(0,220px)_90px_90px] items-center gap-4 px-5 py-3 cursor-pointer" onclick="openPortfolioDetail(${pt.id})">
      <div class="flex items-center gap-3 min-w-0">
        <div class="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
          <span class="material-symbols-outlined text-primary text-[18px]">folder_special</span>
        </div>
        <p class="text-sm font-semibold text-on-surface truncate">${esc(pt.name)}</p>
      </div>
      <p class="text-xs text-on-surface-variant truncate">${esc(shopMap[pt.shop_id] || '—')}</p>
      <p class="font-mono text-sm text-on-surface">${pt.client_count}</p>
      <p class="font-mono text-sm text-on-surface">${pt.watch_count}</p>
    </div>`;
}

function renderAllPortfolios() {
  const { shopMap } = _portfoliosCache;
  const [sortKey, sortDir] = getSort('portfolios').split(':');
  const PF_SORT = { name: p => p.name || '', shop: p => shopMap[p.shop_id] || '', clients: p => p.client_count ?? 0, watches: p => p.watch_count ?? 0 };
  const allPortfolios = sortByKey(_portfoliosCache.allPortfolios, PF_SORT[sortKey] || PF_SORT.name, sortDir);
  const grid = document.getElementById('allPortfoliosGrid');
  if (getView('portfolios') === 'list') {
    grid.className = 'glass-surface rounded-lg overflow-hidden divide-y divide-white/[0.04]';
    grid.innerHTML = allPortfolios.length
      ? `<div class="grid grid-cols-[minmax(0,1fr)_minmax(0,220px)_90px_90px] gap-4 px-5 py-3 bg-surface-container-low">
           <button type="button" class="sort-th" data-sort-scope="portfolios" data-sort-key="name">Portfolio<span class="material-symbols-outlined sort-icon">unfold_more</span></button><button type="button" class="sort-th" data-sort-scope="portfolios" data-sort-key="shop">Shop<span class="material-symbols-outlined sort-icon">unfold_more</span></button><button type="button" class="sort-th" data-sort-scope="portfolios" data-sort-key="clients">Clients<span class="material-symbols-outlined sort-icon">unfold_more</span></button><button type="button" class="sort-th" data-sort-scope="portfolios" data-sort-key="watches">Watches<span class="material-symbols-outlined sort-icon">unfold_more</span></button>
         </div>` + allPortfolios.map(portfolioRowHtml).join('')
      : `<div class="p-12 text-center text-on-surface-variant text-sm">No portfolios yet.</div>`;
    syncSortControls('portfolios');
    return;
  }
  grid.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4';
  grid.innerHTML = allPortfolios.length
    ? allPortfolios.map(pt => `
      <div class="glass-surface rounded-lg p-6 hover:border-primary/20 border border-transparent transition-all cursor-pointer group"
           onclick="openPortfolioDetail(${pt.id})">
        <div class="flex items-start justify-between mb-4">
          <div class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <span class="material-symbols-outlined text-primary">folder_special</span>
          </div>
          <span class="text-[11px] uppercase tracking-wider text-outline">${esc(shopMap[pt.shop_id] || '')}</span>
        </div>
        <h3 class="font-playfair text-lg font-semibold text-on-surface mb-1">${esc(pt.name)}</h3>
        <div class="flex items-center gap-4 pt-4 border-t border-outline-variant/10">
          <div class="flex items-center gap-1.5">
            <span class="material-symbols-outlined text-primary text-[16px]">group</span>
            <span class="text-sm text-on-surface-variant">${pt.client_count} client${pt.client_count !== 1 ? 's' : ''}</span>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="material-symbols-outlined text-primary text-[16px]">watch</span>
            <span class="text-sm text-on-surface-variant">${pt.watch_count} watch${pt.watch_count !== 1 ? 'es' : ''}</span>
          </div>
        </div>
      </div>`).join('')
    : `<div class="col-span-3 glass-surface rounded-lg p-12 text-center text-on-surface-variant text-sm">No portfolios yet.</div>`;
}

async function openShopDetail(id) {
  currentShopId = id;
  showPage('shop-detail');
  const [shop, portfolios, indClients] = await Promise.all([
    api('GET', `/api/shops/${id}`),
    api('GET', `/api/portfolios?shop_id=${id}`),
    api('GET', `/api/shops/${id}/individual-clients`),
  ]);

  const allClients = shop.profiles || [];
  const totalWatches = allClients.reduce((sum, p) => sum + (p.watch_count || 0), 0);

  document.getElementById('shopDetailHeader').innerHTML = `
    <div class="flex items-start justify-between gap-4 flex-wrap mb-6">
      <div>
        <p class="text-[11px] uppercase tracking-[0.06em] text-primary font-semibold mb-1">Authorised Retailer</p>
        <h2 class="font-playfair text-3xl font-semibold text-on-surface">${esc(shop.name)}</h2>
        ${shop.address ? `<p class="text-on-surface-variant text-sm mt-2 whitespace-pre-line">${esc(shop.address)}</p>` : ''}
      </div>
      <div class="flex items-center gap-2">
        <button onclick="downloadShopPdf(${id})" title="All portfolios, clients and watches in this shop as a linked PDF" class="text-[11px] font-semibold uppercase tracking-wider text-on-primary bg-primary px-4 py-2 rounded-lg hover:brightness-110 active:scale-95 transition-all flex items-center gap-1.5">
          <span class="material-symbols-outlined text-[15px]">picture_as_pdf</span> PDF Report
        </button>
        <button onclick="openEditShop(${id})" class="text-[11px] font-semibold uppercase tracking-wider text-primary px-4 py-2 border border-primary/30 rounded-lg hover:bg-primary/10 transition-all">Edit Shop</button>
      </div>
    </div>
    <div class="grid grid-cols-3 gap-4 max-w-lg">
      <div class="glass-surface rounded-lg p-4 flex flex-col gap-1">
        <span class="text-[11px] uppercase tracking-[0.06em] text-on-surface-variant font-semibold">Portfolios</span>
        <span class="font-playfair text-2xl text-on-surface">${portfolios.length}</span>
      </div>
      <div class="glass-surface rounded-lg p-4 flex flex-col gap-1">
        <span class="text-[11px] uppercase tracking-[0.06em] text-on-surface-variant font-semibold">Clients</span>
        <span class="font-playfair text-2xl text-on-surface">${allClients.length}</span>
      </div>
      <div class="glass-surface rounded-lg p-4 flex flex-col gap-1">
        <span class="text-[11px] uppercase tracking-[0.06em] text-on-surface-variant font-semibold">Watches</span>
        <span class="font-playfair text-2xl text-on-surface">${totalWatches}</span>
      </div>
    </div>
  `;

  _shopDetailCache = { id, portfolios, indClients };
  renderShopDetailLists();

  document.getElementById('addClientForShopBtn').onclick = () => openAddProfile(id, null);
  document.getElementById('addExistingClientForShopBtn').onclick = () =>
    openClientPicker(c => openAddProfile(id, null, c.id, c));
  document.getElementById('addPortfolioBtn').onclick = () => openAddPortfolio(id);
}

let _shopDetailCache = { id: null, portfolios: [], indClients: [] };

// Portfolios + individual clients on the shop page share one List/Cards toggle
function renderShopDetailLists() {
  const { id, portfolios, indClients } = _shopDetailCache;
  if (id == null) return;
  const asCards = getView('shopDetail') === 'cards';
  const grid = document.getElementById('portfoliosGrid');

  if (asCards || !portfolios.length) {
    // Portfolios grid
    grid.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4';
    grid.innerHTML = portfolios.length
      ? portfolios.map(pt => `
        <div class="glass-surface rounded-lg p-6 hover:border-primary/20 border border-transparent transition-all cursor-pointer group"
             onclick="openPortfolioDetail(${pt.id})">
          <div class="flex items-start justify-between mb-4">
            <div class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <span class="material-symbols-outlined text-primary">folder_special</span>
            </div>
            <div class="flex gap-1 opacity-60 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
              <button onclick="event.stopPropagation(); generateShareLink(${pt.id})"
                      class="p-1.5 rounded-lg hover:bg-surface-variant/30 text-on-surface-variant hover:text-primary transition-colors" title="Copy share link">
                <span class="material-symbols-outlined text-[16px]">link</span>
              </button>
              <button onclick="event.stopPropagation(); openEditPortfolio(${pt.id},'${esc(pt.name).replace(/'/g,"\\'")}')"
                      class="p-1.5 rounded-lg hover:bg-surface-variant/30 text-on-surface-variant hover:text-primary transition-colors" title="Rename">
                <span class="material-symbols-outlined text-[16px]">edit</span>
              </button>
              <button onclick="event.stopPropagation(); confirmDeletePortfolio(${pt.id},'${esc(pt.name).replace(/'/g,"\\'")}')"
                      class="p-1.5 rounded-lg hover:bg-error/10 text-on-surface-variant hover:text-error transition-colors" title="Delete">
                <span class="material-symbols-outlined text-[16px]">delete</span>
              </button>
            </div>
          </div>
          <h3 class="font-playfair text-lg font-semibold text-on-surface mb-1">${esc(pt.name)}</h3>
          <div class="flex items-center gap-4 pt-4 border-t border-outline-variant/10">
            <div class="flex items-center gap-1.5">
              <span class="material-symbols-outlined text-primary text-[16px]">group</span>
              <span class="text-sm text-on-surface-variant">${pt.client_count} client${pt.client_count !== 1 ? 's' : ''}</span>
            </div>
            <div class="flex items-center gap-1.5">
              <span class="material-symbols-outlined text-primary text-[16px]">watch</span>
              <span class="text-sm text-on-surface-variant">${pt.watch_count} watch${pt.watch_count !== 1 ? 'es' : ''}</span>
            </div>
          </div>
        </div>`).join('')
      : `<div class="glass-surface rounded-lg p-10 text-center text-on-surface-variant text-sm border border-dashed border-outline-variant/20 col-span-3">
           No portfolios yet — <button onclick="openAddPortfolio(${id})" class="text-primary underline">create one</button>
         </div>`;


  } else {
    grid.className = 'glass-surface rounded-lg overflow-hidden divide-y divide-white/[0.04]';
    grid.innerHTML = `<div class="grid grid-cols-[minmax(0,1fr)_100px_100px_auto] gap-4 px-5 py-3 bg-surface-container-low">
        <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-on-surface-variant">Portfolio</p><p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-on-surface-variant">Clients</p><p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-on-surface-variant">Watches</p><p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-on-surface-variant w-[108px]"></p>
      </div>` + portfolios.map(pt => `
      <div class="tbl-row grid grid-cols-[minmax(0,1fr)_100px_100px_auto] items-center gap-4 px-5 py-3 cursor-pointer" onclick="openPortfolioDetail(${pt.id})">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
            <span class="material-symbols-outlined text-primary text-[18px]">folder_special</span>
          </div>
          <p class="text-sm font-semibold text-on-surface truncate">${esc(pt.name)}</p>
        </div>
        <p class="font-mono text-sm text-on-surface">${pt.client_count}</p>
        <p class="font-mono text-sm text-on-surface">${pt.watch_count}</p>
        <div class="flex gap-0.5 justify-end">
          <button onclick="event.stopPropagation(); generateShareLink(${pt.id})" title="Copy share link" aria-label="Copy share link" class="${CARD_ICON_BTN}">
            <span class="material-symbols-outlined text-[18px]">link</span>
          </button>
          <button onclick="event.stopPropagation(); openEditPortfolio(${pt.id},'${esc(pt.name).replace(/'/g,"\\'")}')" title="Rename" aria-label="Rename portfolio" class="${CARD_ICON_BTN}">
            <span class="material-symbols-outlined text-[18px]">edit</span>
          </button>
          <button onclick="event.stopPropagation(); confirmDeletePortfolio(${pt.id},'${esc(pt.name).replace(/'/g,"\\'")}')" title="Delete" aria-label="Delete portfolio" class="p-2 rounded-lg hover:bg-error/10 text-on-surface-variant hover:text-error transition-colors">
            <span class="material-symbols-outlined text-[18px]">delete</span>
          </button>
        </div>
      </div>`).join('');
  }

  // Individual clients: table rows (with the expandable watch list) or cards
  document.getElementById('shopClientsListWrap').classList.toggle('hidden', asCards);
  document.getElementById('shopClientsCards').classList.toggle('hidden', !asCards);
  if (asCards) {
    document.getElementById('shopClientsCards').innerHTML = indClients.length
      ? indClients.map(shopClientCardHtml).join('')
      : `<div class="col-span-full py-10 text-center text-on-surface-variant text-sm">No individual clients.</div>`;
  } else {
    document.getElementById('shopClientsBody').innerHTML = indClients.length
      ? indClients.map(p => clientRow(p)).join('')
      : `<tr><td colspan="4" class="px-6 py-10 text-center text-on-surface-variant text-sm">No individual clients.</td></tr>`;
  }
}

function shopClientCardHtml(p) {
  return `
  <div class="view-card group cursor-pointer" onclick="openProfileDetail(${p.id})">
    <div class="flex items-center gap-3">
      ${avatarHtml(p.name, p.photo_path)}
      <div class="min-w-0 flex-1">
        <p class="text-on-surface font-semibold text-[15px] truncate">${esc(p.name)}</p>
        <p class="text-xs text-on-surface-variant truncate">${esc(p.email || '—')}</p>
      </div>
    </div>
    <div class="grid grid-cols-2 gap-2 mt-4">
      <div class="view-card-stat">
        <p class="view-card-label">Watches</p>
        <p class="font-mono text-xl font-semibold text-on-surface">${p.watch_count}</p>
      </div>
      <div class="view-card-stat">
        <p class="view-card-label">Added</p>
        <p class="font-mono text-sm font-semibold text-on-surface mt-1.5">${fmt.date(p.created_at.split(' ')[0])}</p>
      </div>
    </div>
    <div class="flex items-center justify-end gap-0.5 mt-4 pt-3 border-t border-outline-variant/40">
      <button onclick="event.stopPropagation(); openAddWatch(${p.id})" title="Add Watch" aria-label="Add watch" class="${CARD_ICON_BTN}">
        <span class="material-symbols-outlined text-[18px]">add_circle</span>
      </button>
      <button onclick="event.stopPropagation(); openProfileDetail(${p.id})" title="View Membership" aria-label="View membership" class="${CARD_ICON_BTN}">
        <span class="material-symbols-outlined text-[18px]">open_in_new</span>
      </button>
      <button onclick="event.stopPropagation(); openEditProfile(${p.id})" title="Edit" aria-label="Edit client" class="${CARD_ICON_BTN}">
        <span class="material-symbols-outlined text-[18px]">edit</span>
      </button>
    </div>
  </div>`;
}

function clientRow(p) {
  return `
    <tr class="tbl-row" id="client-row-${p.id}">
      <td class="px-5 py-3">
        <div class="flex items-center gap-4">
          ${avatarHtml(p.name, p.photo_path)}
          <div>
            <div class="text-on-surface font-medium text-sm">${esc(p.name)}</div>
            <div class="text-on-surface-variant text-xs mt-0.5">${esc(p.email || '—')}</div>
          </div>
        </div>
      </td>
      <td class="px-5 py-3">
        <button onclick="toggleWatchExpand(${p.id})"
                id="watch-expand-btn-${p.id}"
                class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide px-3 py-1.5 rounded-lg border border-primary/40 text-primary bg-primary/10 hover:bg-primary/20 transition-all">
          <span class="material-symbols-outlined text-[14px]">watch</span>
          ${p.watch_count} piece${p.watch_count !== 1 ? 's' : ''}
          <span class="material-symbols-outlined text-[14px] transition-transform duration-200" id="watch-expand-icon-${p.id}">expand_more</span>
        </button>
      </td>
      <td class="px-5 py-3 text-on-surface-variant text-sm">${fmt.date(p.created_at.split(' ')[0])}</td>
      <td class="px-5 py-3">
        <div class="flex items-center justify-end gap-1">
          <button onclick="openAddWatch(${p.id})" title="Add Watch" class="p-2 rounded-lg hover:bg-primary/10 text-on-surface-variant hover:text-primary transition-colors">
            <span class="material-symbols-outlined text-[18px]">add_circle</span>
          </button>
          <button onclick="openProfileDetail(${p.id})" title="View Membership" class="p-2 rounded-lg hover:bg-surface-variant/30 text-on-surface-variant hover:text-primary transition-colors">
            <span class="material-symbols-outlined text-[18px]">open_in_new</span>
          </button>
          <button onclick="openEditProfile(${p.id})" title="Edit" class="p-2 rounded-lg hover:bg-surface-variant/30 text-on-surface-variant hover:text-primary transition-colors">
            <span class="material-symbols-outlined text-[18px]">edit</span>
          </button>
        </div>
      </td>
    </tr>
    <tr id="watches-expand-${p.id}" class="hidden">
      <td colspan="4" class="px-0 pt-0 pb-1">
        <div id="watches-expand-content-${p.id}" style="background:rgba(255,255,255,0.012); border-top:1px solid rgba(255,255,255,0.06)">
          <div class="px-10 py-4 text-on-surface-variant text-sm italic">Loading…</div>
        </div>
      </td>
    </tr>`;
}

async function toggleWatchExpand(profileId) {
  const row    = document.getElementById(`watches-expand-${profileId}`);
  const icon   = document.getElementById(`watch-expand-icon-${profileId}`);
  const isOpen = !row.classList.contains('hidden');

  if (isOpen) {
    row.classList.add('hidden');
    icon.style.transform = '';
    return;
  }

  row.classList.remove('hidden');
  icon.style.transform = 'rotate(180deg)';

  const content = document.getElementById(`watches-expand-content-${profileId}`);
  content.innerHTML = `<div class="px-10 py-4 text-on-surface-variant text-sm italic">Loading…</div>`;

  try {
    const profile = await api('GET', `/api/profiles/${profileId}`);
    const watches = profile.watches || [];

    if (!watches.length) {
      content.innerHTML = `
        <div class="px-10 py-5 flex items-center gap-3 text-on-surface-variant text-sm">
          <span class="material-symbols-outlined text-[18px]">watch_off</span>
          No watches registered yet.
          <button onclick="openAddWatch(${profileId})" class="ml-2 text-primary text-xs font-semibold hover:underline">Add one →</button>
        </div>`;
      return;
    }

    content.innerHTML = `
      <div class="overflow-x-auto">
        <table class="w-full text-left">
          <thead>
            <tr style="background:rgba(255,255,255,0.025); border-bottom:1px solid rgba(255,255,255,0.07)">
              <th class="px-10 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-on-surface-variant">Timepiece</th>
              <th class="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-on-surface-variant">Stock #</th>
              <th class="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-on-surface-variant">Serial #</th>
              <th class="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-on-surface-variant">Ref #</th>
              <th class="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-on-surface-variant">Date</th>
              <th class="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-on-surface-variant">Price</th>
              <th class="px-5 py-2.5"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-white/[0.04]">
            ${watches.map(w => `
            <tr>
              <td class="px-10 py-3">
                <div class="flex items-center gap-3">
                  ${w.image_path
                    ? `<div class="w-10 h-10 rounded-lg border border-outline-variant/20 overflow-hidden flex-shrink-0 cursor-zoom-in" onclick="openLightbox('${w.image_path}')"><img src="${w.image_path}" class="w-full h-full object-cover"></div>`
                    : `<div class="w-10 h-10 rounded-lg border border-outline-variant/15 flex items-center justify-center flex-shrink-0"><span class="material-symbols-outlined text-outline text-[18px]">watch</span></div>`
                  }
                  <div>
                    <p class="text-on-surface text-sm font-medium leading-tight">${esc(w.model)}</p>
                    ${w.movement_number || w.case_number ? `<p class="text-on-surface-variant text-xs mt-0.5 font-mono">${[w.movement_number, w.case_number].filter(Boolean).join(' / ')}</p>` : ''}
                  </div>
                </div>
              </td>
              <td class="px-5 py-3 text-on-surface-variant text-xs font-mono">${w.stock_number ? esc(w.stock_number) : '<span class="text-outline">—</span>'}</td>
              <td class="px-5 py-3 text-on-surface-variant text-xs font-mono">${esc(w.serial_number || '—')}</td>
              <td class="px-5 py-3 text-on-surface-variant text-xs font-mono">${esc(w.reference_number || '—')}</td>
              <td class="px-5 py-3 text-on-surface-variant text-xs">${fmt.date(w.purchase_date)}</td>
              <td class="px-5 py-3 font-semibold text-primary text-sm">${fmt.money(w.price)}</td>
              <td class="px-5 py-3">
                <div class="flex items-center justify-end gap-1">
                  <button onclick="openEditWatch(${w.id})" class="p-1.5 rounded-lg hover:bg-surface-variant/30 text-on-surface-variant hover:text-primary transition-colors">
                    <span class="material-symbols-outlined text-[15px]">edit</span>
                  </button>
                  <button onclick="confirmDeleteWatch(${w.id},'${esc(w.model).replace(/'/g,"\\'")}')" class="p-1.5 rounded-lg hover:bg-error/10 text-on-surface-variant hover:text-error transition-colors">
                    <span class="material-symbols-outlined text-[15px]">delete</span>
                  </button>
                </div>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  } catch (e) {
    content.innerHTML = `<div class="px-10 py-4 text-error text-sm">Failed to load watches.</div>`;
  }
}

// ── Portfolio detail ───────────────────────────────────────────────────────
let currentPortfolioId = null;

async function openPortfolioDetail(id) {
  currentPortfolioId = id;
  showPage('portfolio-detail');
  const portfolio = await api('GET', `/api/portfolios/${id}`);

  const clients = portfolio.clients || [];
  const totalPortfolioWatches = clients.reduce((sum, p) => sum + (p.watch_count || 0), 0);

  document.getElementById('portfolioDetailHeader').innerHTML = `
    <div class="flex items-start justify-between gap-4 flex-wrap mb-6">
      <div>
        <p class="text-[11px] uppercase tracking-[0.06em] text-primary font-semibold mb-1">
          <button onclick="openShopDetail(${portfolio.shop_id})" class="hover:underline">${esc(portfolio.shop_name)}</button> · Portfolio
        </p>
        <h2 class="font-playfair text-3xl font-semibold text-on-surface">${esc(portfolio.name)}</h2>
      </div>
      <div class="flex items-center gap-2">
        <button onclick="generateShareLink(${id})"
                class="text-[11px] font-semibold uppercase tracking-wider text-on-surface px-4 py-2 border border-outline-variant/30 rounded-lg hover:bg-surface-variant/30 transition-all flex items-center gap-1.5" id="shareLinkBtn-${id}">
          <span class="material-symbols-outlined text-[15px]">link</span> Share Link
        </button>
        <button onclick="openEditPortfolio(${id},'${esc(portfolio.name).replace(/'/g,"\\'")}')"
                class="text-[11px] font-semibold uppercase tracking-wider text-primary px-4 py-2 border border-primary/30 rounded-lg hover:bg-primary/10 transition-all">Rename</button>
        <button onclick="confirmDeletePortfolio(${id},'${esc(portfolio.name).replace(/'/g,"\\'")}')"
                class="text-[11px] font-semibold uppercase tracking-wider text-error px-4 py-2 border border-error/20 rounded-lg hover:bg-error/10 transition-all">Delete</button>
      </div>
    </div>
    <div class="grid grid-cols-2 gap-4 max-w-xs">
      <div class="glass-surface rounded-lg p-4 flex flex-col gap-1">
        <span class="text-[11px] uppercase tracking-[0.06em] text-on-surface-variant font-semibold">Clients</span>
        <span class="font-playfair text-2xl text-on-surface">${clients.length}</span>
      </div>
      <div class="glass-surface rounded-lg p-4 flex flex-col gap-1">
        <span class="text-[11px] uppercase tracking-[0.06em] text-on-surface-variant font-semibold">Watches</span>
        <span class="font-playfair text-2xl text-on-surface">${totalPortfolioWatches}</span>
      </div>
    </div>
  `;

  _portfolioDetailClients = clients;
  renderPortfolioDetailClients();

  document.getElementById('addClientForPortfolioBtn').onclick = () => openAddProfile(portfolio.shop_id, id);
  document.getElementById('addExistingClientForPortfolioBtn').onclick = () =>
    openClientPicker(c => openAddProfile(portfolio.shop_id, id, c.id, c));
  document.getElementById('backToShopFromPortfolio').onclick = () => openShopDetail(portfolio.shop_id);
}

let _portfolioDetailClients = null;

// Portfolio page clients: table rows (with the expandable watch list) or cards
function renderPortfolioDetailClients() {
  const clients = _portfolioDetailClients;
  if (!clients) return;
  const asCards = getView('portfolioDetail') === 'cards';
  document.getElementById('portfolioClientsListWrap').classList.toggle('hidden', asCards);
  document.getElementById('portfolioClientsCards').classList.toggle('hidden', !asCards);
  if (asCards) {
    document.getElementById('portfolioClientsCards').innerHTML = clients.length
      ? clients.map(shopClientCardHtml).join('')
      : `<div class="col-span-full py-16 text-center text-on-surface-variant text-sm">No clients in this portfolio yet.</div>`;
  } else {
    document.getElementById('portfolioClientsBody').innerHTML = clients.length
      ? clients.map(p => clientRow(p)).join('')
      : `<tr><td colspan="4" class="px-6 py-16 text-center text-on-surface-variant text-sm">No clients in this portfolio yet.</td></tr>`;
  }
}

// ── Portfolio modal ────────────────────────────────────────────────────────
function openAddPortfolio(shopId) {
  document.getElementById('portfolioId').value      = '';
  document.getElementById('portfolioShopId').value  = shopId;
  document.getElementById('portfolioName').value    = '';
  document.getElementById('portfolioFormError').classList.add('hidden');
  document.getElementById('portfolioModalTitle').textContent = 'Add Portfolio';
  document.getElementById('portfolioModal').classList.remove('hidden');
  document.getElementById('portfolioName').focus();
}

function openEditPortfolio(id, name) {
  document.getElementById('portfolioId').value      = id;
  document.getElementById('portfolioName').value    = name;
  document.getElementById('portfolioFormError').classList.add('hidden');
  document.getElementById('portfolioModalTitle').textContent = 'Rename Portfolio';
  document.getElementById('portfolioModal').classList.remove('hidden');
  document.getElementById('portfolioName').focus();
}

function closePortfolioModal() { document.getElementById('portfolioModal').classList.add('hidden'); }
document.getElementById('closePortfolioModal').addEventListener('click', closePortfolioModal);
document.getElementById('cancelPortfolioModal').addEventListener('click', closePortfolioModal);

document.getElementById('savePortfolioBtn').addEventListener('click', async () => {
  const id      = document.getElementById('portfolioId').value;
  const shopId  = document.getElementById('portfolioShopId').value;
  const name    = document.getElementById('portfolioName').value.trim();
  const errEl   = document.getElementById('portfolioFormError');
  errEl.classList.add('hidden');
  if (!name) { errEl.textContent = 'Portfolio name is required'; errEl.classList.remove('hidden'); return; }
  try {
    if (id) {
      await api('PUT', `/api/portfolios/${id}`, { name });
    } else {
      await api('POST', '/api/portfolios', { name, shop_id: shopId });
    }
    closePortfolioModal();
    if (currentPage === 'shop-detail')       openShopDetail(currentShopId);
    if (currentPage === 'portfolio-detail')  openPortfolioDetail(currentPortfolioId);
  } catch (e) {
    errEl.textContent = e.message; errEl.classList.remove('hidden');
  }
});

// Robust clipboard copy. Modern API first (requires HTTPS / secure context),
// then execCommand fallback for older / file-protocol / iframe contexts. Returns
// true on success, false if both methods fail.
async function tryCopyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_) { /* fall through to execCommand */ }
  // Fallback: temporary textarea + execCommand('copy')
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top  = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return !!ok;
  } catch (_) {
    return false;
  }
}

let _shareLinkUrl = null;

// Show the share-link result modal. Always reveals the URL so even if the
// clipboard attempt fails, the user can select/copy manually — preventing
// the "link generated but lost" bug that caused token rotations to strand
// the previous link in an unusable state.
async function showShareLinkResult(url, subtitle) {
  _shareLinkUrl = url;
  document.getElementById('shareLinkUrl').value     = url;
  document.getElementById('shareLinkSubtitle').textContent = subtitle || 'Anyone with this link can view the shared data. Re-generating invalidates the previous link.';
  document.getElementById('shareLinkModal').classList.remove('hidden');
  // Auto-attempt clipboard once on open; update button + hint based on result.
  const btn  = document.getElementById('shareLinkCopyBtn');
  const hint = document.getElementById('shareLinkHint');
  btn.innerHTML  = '<span class="material-symbols-outlined text-[16px]">content_copy</span> Copy';
  btn.disabled   = false;
  hint.textContent = 'If clipboard access is blocked, tap the URL above to select it, then copy manually.';
  const ok = await tryCopyToClipboard(url);
  if (ok) {
    btn.innerHTML  = '<span class="material-symbols-outlined text-[16px]">check</span> Copied';
    btn.classList.add('text-emerald-400');
    hint.textContent = 'Link copied to clipboard.';
  } else {
    hint.textContent = 'Clipboard blocked by browser — please select the URL above and copy it manually.';
  }
  // Pre-select the input so mobile users / blocked-clipboard users can ⌘C immediately
  setTimeout(() => {
    const input = document.getElementById('shareLinkUrl');
    input.focus(); input.select();
  }, 50);
}

async function copyShareLinkFromModal() {
  if (!_shareLinkUrl) return;
  const btn  = document.getElementById('shareLinkCopyBtn');
  const hint = document.getElementById('shareLinkHint');
  const ok = await tryCopyToClipboard(_shareLinkUrl);
  if (ok) {
    btn.innerHTML = '<span class="material-symbols-outlined text-[16px]">check</span> Copied';
    btn.classList.add('text-emerald-400');
    hint.textContent = 'Link copied to clipboard.';
    setTimeout(() => {
      btn.innerHTML = '<span class="material-symbols-outlined text-[16px]">content_copy</span> Copy';
      btn.classList.remove('text-emerald-400');
    }, 2000);
  } else {
    hint.textContent = 'Clipboard blocked by browser — please select the URL above and copy it manually.';
    // Still re-focus the input so the user can manually select
    const input = document.getElementById('shareLinkUrl');
    input.focus(); input.select();
  }
}

function closeShareLinkModal() {
  document.getElementById('shareLinkModal').classList.add('hidden');
  _shareLinkUrl = null;
  // Reset copy button colour in case the modal is reopened later
  const btn = document.getElementById('shareLinkCopyBtn');
  if (btn) btn.classList.remove('text-emerald-400');
}

// Portfolio share — generates a new token, then opens the modal with the URL.
// The modal handles copy/fallback so the link is never lost on clipboard fail.
async function generateShareLink(id) {
  const btn = document.getElementById(`shareLinkBtn-${id}`);
  if (btn) { btn.innerHTML = '<span class="material-symbols-outlined text-[15px]">link</span> Generating…'; btn.disabled = true; }
  try {
    const { url } = await api('POST', `/api/portfolios/${id}/generate-link`);
    const fullUrl = window.location.origin + url;
    await showShareLinkResult(fullUrl, 'Anyone with this link can view this portfolio. Re-generating invalidates the previous link.');
  } catch (e) {
    alert('Could not generate link: ' + (e.message || 'unknown error'));
  } finally {
    if (btn) { btn.innerHTML = '<span class="material-symbols-outlined text-[15px]">link</span> Share Link'; btn.disabled = false; }
  }
}

// Client share — same pattern. POST always rotates the token, so the URL
// returned is the only valid one; the modal makes sure the user gets it.
async function generateClientShareLink(id) {
  const btn = document.getElementById(`clientShareBtn-${id}`);
  const setBtn = (html, disabled) => { if (btn) { btn.innerHTML = html; btn.disabled = disabled; } };
  setBtn('<span class="material-symbols-outlined text-[14px]">link</span> Generating…', true);
  try {
    const { url } = await api('POST', `/api/clients/${id}/generate-link`);
    const fullUrl = window.location.origin + url;
    await showShareLinkResult(fullUrl, 'Anyone with this link can view this client\'s watch list. Re-generating invalidates the previous link.');
  } catch (e) {
    alert('Could not generate link: ' + (e.message || 'unknown error'));
  } finally {
    setBtn('<span class="material-symbols-outlined text-[14px]">link</span> Share Link', false);
  }
}

function confirmDeletePortfolio(id, name) {
  showConfirm(`Delete portfolio "${name}"? Its clients will become individual clients of the shop.`, async () => {
    await api('DELETE', `/api/portfolios/${id}`);
    openShopDetail(currentShopId);
  });
}

function openAddShop() {
  document.getElementById('shopId').value      = '';
  document.getElementById('shopName').value    = '';
  document.getElementById('shopAddress').value = '';
  document.getElementById('shopFormError').classList.add('hidden');
  document.getElementById('shopModalTitle').textContent = 'Add Shop';
  document.getElementById('shopModal').classList.remove('hidden');
  document.getElementById('shopName').focus();
}

async function openEditShop(id) {
  const shop = await api('GET', `/api/shops/${id}`);
  document.getElementById('shopId').value      = shop.id;
  document.getElementById('shopName').value    = shop.name;
  document.getElementById('shopAddress').value = shop.address || '';
  document.getElementById('shopFormError').classList.add('hidden');
  document.getElementById('shopModalTitle').textContent = 'Edit Shop';
  document.getElementById('shopModal').classList.remove('hidden');
  document.getElementById('shopName').focus();
}

function closeShopModal() { document.getElementById('shopModal').classList.add('hidden'); }
document.getElementById('closeShopModal').addEventListener('click', closeShopModal);
document.getElementById('cancelShopModal').addEventListener('click', closeShopModal);
document.getElementById('shopModal').addEventListener('click', e => { if (e.target === e.currentTarget) closeShopModal(); });

document.getElementById('saveShopBtn').addEventListener('click', async () => {
  const id      = document.getElementById('shopId').value;
  const name    = document.getElementById('shopName').value.trim();
  const address = document.getElementById('shopAddress').value.trim();
  const errEl   = document.getElementById('shopFormError');
  errEl.classList.add('hidden');
  if (!name) { errEl.textContent = 'Shop name is required'; errEl.classList.remove('hidden'); return; }
  try {
    if (id) {
      await api('PUT', `/api/shops/${id}`, { name, address });
    } else {
      await api('POST', '/api/shops', { name, address });
    }
    closeShopModal();
    if (currentPage === 'shops')       loadShops();
    if (currentPage === 'shop-detail') openShopDetail(currentShopId);
  } catch (e) {
    errEl.textContent = e.message; errEl.classList.remove('hidden');
  }
});

function confirmDeleteShop(id, name) {
  showConfirm(`Delete shop "${name}"? Clients will become unassigned but not deleted.`, async () => {
    await api('DELETE', `/api/shops/${id}`);
    showPage('shops');
  });
}

document.getElementById('addShopBtn').addEventListener('click', openAddShop);
document.getElementById('backToShops').addEventListener('click', () => showPage('shops'));
