// 01-core.js — API helper, routing, logout, current user
// Part of the dashboard script: scripts/build.js concatenates src/dashboard/*.js
// in filename order into public/js/dashboard.js (one classic script, so
// functions and top-level variables stay shared exactly as before).

/* ══════════════════════════════════════════════════════════════════════
   Meridian Watch Registry — App Logic
══════════════════════════════════════════════════════════════════════ */

// ── API ────────────────────────────────────────────────────────────────────
async function api(method, url, data) {
  const opts = { method, headers: {} };
  if (data instanceof FormData) {
    opts.body = data;
  } else if (data) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(data);
  }
  const res = await fetch(url, opts);
  if (res.status === 401) { window.location.href = '/'; return; }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Request failed');
  return json;
}

const fmt = {
  date:     d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—',
  money:    v => v != null && v !== '' ? '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 }) : '—',
  price:    (v, cur) => { if (v == null || v === '') return '—'; const s={CHF:'CHF ',EUR:'€',GBP:'£'}; const n=Number(v); const r=Math.round(n); return (r<0?'−':'')+(s[cur]||((cur||'')+' '))+Math.abs(n).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0}); },
  initials: n => (n||'').split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2),
  // Render a per-currency amount map. Pass { CHF: 10000, EUR: 2500 }.
  // - empty/all-zero  → '—'
  // - single currency → single line
  // - multiple        → stacked lines, one per currency
  // `signed`: prefix positive numbers with '+'.
  byCurrency: (map, opts = {}) => {
    const entries = Object.entries(map || {}).filter(([_, v]) => Number(v) !== 0);
    if (!entries.length) return '<span class="text-on-surface-variant/60">—</span>';
    const sign = opts.signed ? (v => v > 0 ? '+' : '') : (() => '');
    const cls  = opts.colour
      ? (v => v > 0 ? 'text-emerald-400' : v < 0 ? 'text-error' : '')
      : (() => '');
    if (entries.length === 1) {
      const [cur, val] = entries[0];
      return `<span class="${cls(val)}">${sign(val)}${fmt.price(val, cur)}</span>`;
    }
    return entries
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .map(([cur, val]) => `<div class="leading-tight ${cls(val)}">${sign(val)}${fmt.price(val, cur)}</div>`)
      .join('');
  },
};

// ── Routing ────────────────────────────────────────────────────────────────
let currentPage = 'dashboard';
let currentProfileId = null;
let currentShopId = null;
const PAGES = ['dashboard','shops','portfolios','main-kpi','shop-detail','portfolio-detail','profiles','client-detail','profile-detail','watch-detail','watches','desk','messages','settings','admin'];

function showPage(name) {
  scrubAutofilledSearches();
  PAGES.forEach(p => {
    const el = document.getElementById(`page-${p}`);
    if (el) {
      el.classList.toggle('hidden', p !== name);
      if (p === name) el.classList.add('page-enter');
    }
  });

  // Sidebar active states
  document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
    btn.classList.remove('nav-active');
    btn.classList.add('nav-inactive');
    if (btn.dataset.page === name) {
      btn.classList.remove('nav-inactive');
      btn.classList.add('nav-active');
    }
  });

  const titles = { dashboard:'Vault', shops:'Shops', portfolios:'Portfolios', 'main-kpi':'Main KPI', 'shop-detail':'Shop Detail', 'portfolio-detail':'Portfolio Detail', profiles:'Clients', 'client-detail':'Client', 'profile-detail':'Membership', 'watch-detail':'Watch', watches:'Watches', desk:'Patek Desk', messages:'Messages', settings:'Settings', admin:'Admin' };
  document.getElementById('topbarTitle').textContent = titles[name] || '';

  const showAddProfile   = name === 'profiles';
  const showAddWatch     = name === 'watches';
  const showAddShop      = name === 'shops';
  const showAddPortfolio = name === 'shop-detail';
  if (name === 'profiles') loadClients();
  document.getElementById('addProfileBtn').classList.toggle('hidden', !showAddProfile);
  document.getElementById('addWatchTopBtn').classList.toggle('hidden', !showAddWatch);
  document.getElementById('addShopBtn').classList.toggle('hidden', !showAddShop);
  document.getElementById('addPortfolioBtn').classList.toggle('hidden', !showAddPortfolio);
  document.getElementById('globalSearchWrap').classList.toggle('hidden', name === 'settings');

  currentPage = name;
  if (name === 'dashboard')  loadDashboard();
  if (name === 'shops')      loadShops();
  if (name === 'portfolios') loadAllPortfolios();
  if (name === 'main-kpi')   loadMainKpi();
  if (name === 'watches')    loadWatches();
  if (name === 'desk')       loadPatekDesk();
  if (name === 'settings')  resetPasswordForm();
  if (name === 'messages')  loadMsgClients();
  if (name === 'admin')     loadAdmin();
}

// Lazy-load the Patek Desk iframe on first visit. Subsequent navigations
// re-use the loaded iframe and preserve its in-tab state (deal lines, FX
// edits, etc.) without reload. Also resets the parent <main> scroll so the
// iframe — and its sticky tab header — sits flush with the top of the
// viewport even when arriving from a long scrolled page like Watches.
function loadPatekDesk() {
  const f = document.getElementById('patekDeskFrame');
  if (f && !f.src) f.src = '/patek-desk.html';
  const main = document.getElementById('mainContent');
  if (main) main.scrollTop = 0;
  window.scrollTo(0, 0);
}

document.querySelectorAll('[data-page]').forEach(el => {
  el.addEventListener('click', () => showPage(el.dataset.page));
});

// ── Logout ─────────────────────────────────────────────────────────────────
document.getElementById('logoutBtn').addEventListener('click', async () => {
  await api('POST', '/api/auth/logout');
  window.location.href = '/';
});

// ── Current user (populated from session on load) ─────────────────────────
let currentUser = null;
async function refreshCurrentUser() {
  try {
    currentUser = await api('GET', '/api/auth/me');
    document.getElementById('currentUserName').textContent    = currentUser.username;
    document.getElementById('currentUserInitial').textContent = (currentUser.username || '?')[0].toUpperCase();
    // Master-only Admin nav item
    const navAdmin = document.getElementById('navAdmin');
    if (currentUser.role === 'master') navAdmin.classList.replace('hidden', 'flex');
    else                                navAdmin.classList.add('hidden');
    // Impersonation banner — when visible, push topbar + main content down
    // so the amber bar doesn't overlap the page header buttons.
    const banner  = document.getElementById('impersonationBanner');
    const topbar  = document.getElementById('topbar');
    const main    = document.getElementById('mainContent');
    const BANNER_HEIGHT = 44; // py-2.5 + text-xs + border ≈ 44px
    if (currentUser.viewing_as) {
      document.getElementById('impersonationName').textContent = currentUser.viewing_as.username;
      banner.classList.replace('hidden', 'flex');
      if (topbar) topbar.style.top         = BANNER_HEIGHT + 'px';
      if (main)   main.style.paddingTop    = (BANNER_HEIGHT + 64) + 'px'; // banner + h-16 topbar
    } else {
      banner.classList.add('hidden');
      if (topbar) topbar.style.top         = '';
      if (main)   main.style.paddingTop    = '';
    }
  } catch (e) {
    window.location.href = '/';
  }
}
refreshCurrentUser();

// Exit impersonation
document.getElementById('impersonationExit')?.addEventListener('click', async () => {
  await api('POST', '/api/admin/view-as-self');
  await refreshCurrentUser();
  showPage('admin');
});
