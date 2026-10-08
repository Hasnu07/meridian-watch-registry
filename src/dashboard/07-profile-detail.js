// 07-profile-detail.js — Profile (membership) detail
// Part of the dashboard script: scripts/build.js concatenates src/dashboard/*.js
// in filename order into public/js/dashboard.js (one classic script, so
// functions and top-level variables stay shared exactly as before).

// ── Profile detail ─────────────────────────────────────────────────────────
let _profileDetailFrom = null; // { page, id } — where we came from

async function openProfileDetail(id) {
  // Reset status filter when switching profiles
  if (id !== currentProfileId) {
    profileWatchStatusFilter = '';
    document.querySelectorAll('.profile-status-tab').forEach(b => {
      const active = b.dataset.status === '';
      b.className = 'profile-status-tab text-[11px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-lg border transition-all ' +
        (active ? 'bg-primary/15 border-primary/40 text-primary' : 'border-outline-variant/30 text-on-surface-variant hover:bg-surface-variant/30');
    });
  }
  // Snapshot origin before showPage changes currentPage
  _profileDetailFrom = {
    page: currentPage,
    id:   currentPage === 'portfolio-detail' ? currentPortfolioId
        : currentPage === 'shop-detail'      ? currentShopId
        : currentPage === 'client-detail'    ? currentClientId
        : null,
  };
  const backLabels = {
    'portfolio-detail': 'Back to Portfolio',
    'shop-detail':      'Back to Shop',
    'client-detail':    'Back to Client',
  };
  document.getElementById('backToProfilesLabel').textContent =
    backLabels[_profileDetailFrom.page] || 'Back to Clients';

  currentProfileId = id;
  showPage('profile-detail');
  const [profile, companyDocs] = await Promise.all([
    api('GET', `/api/profiles/${id}`),
    api('GET', `/api/profiles/${id}/company-docs`),
  ]);

  // Hero header
  document.getElementById('profileDetailHeader').innerHTML = `
    <div class="flex items-start justify-between gap-6 flex-wrap">
      <div class="flex items-start gap-5">
        ${avatarHtml(profile.name, profile.photo_path, 'lg')}
        <div>
          <p class="text-[11px] uppercase tracking-[0.06em] text-primary font-semibold mb-1">
            ${profile.client_id ? `<button onclick="openClientDetail(${profile.client_id})" class="hover:underline">View Full Profile</button> · ` : ''}
            ${profile.shop_name ? esc(profile.shop_name) + ' · ' : ''}Membership
          </p>
          <h2 class="font-playfair text-3xl font-semibold text-on-surface leading-tight">${esc(profile.name)}</h2>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-3 mt-5 pt-5 border-t border-outline-variant/15">
            <div>
              <p class="text-xs text-on-surface-variant mb-0.5">Email</p>
              <p class="text-sm text-on-surface">${esc(profile.email)}</p>
            </div>
            ${profile.address ? `<div>
              <p class="text-xs text-on-surface-variant mb-0.5">Address</p>
              <p class="text-sm text-on-surface leading-relaxed">${esc(profile.address)}</p>
            </div>` : ''}
            ${profile.pp_urn ? `<div>
              <p class="text-xs text-on-surface-variant mb-0.5">PP URN</p>
              <p class="text-sm text-on-surface font-mono">${esc(profile.pp_urn)}</p>
            </div>` : ''}
            <div>
              <p class="text-xs text-on-surface-variant mb-0.5">Member Since</p>
              <p class="text-sm text-on-surface">${fmt.date(profile.created_at.split(' ')[0])}</p>
            </div>
          </div>
        </div>
      </div>
      <div class="flex items-center gap-2 flex-wrap justify-end">
        <button onclick="switchTradingRule(${id},'${profile.trading_rule || 'split'}')"
          class="text-[11px] font-semibold uppercase tracking-wider px-4 py-2 border rounded-lg transition-all ${(profile.trading_rule || 'split') === 'discount' ? 'text-amber-400 border-amber-400/30 hover:bg-amber-400/10' : 'text-purple-400 border-purple-400/30 hover:bg-purple-400/10'}">
          <span class="material-symbols-outlined text-[13px] align-middle mr-1">${(profile.trading_rule || 'split') === 'discount' ? 'sell' : 'percent'}</span>
          ${(profile.trading_rule || 'split') === 'discount' ? 'Discount Split' : 'P/L Split'} · Switch
        </button>
        <button onclick="openEditProfile(${id})" class="text-[11px] font-semibold uppercase tracking-wider text-primary px-4 py-2 border border-primary/30 rounded-lg hover:bg-primary/10 transition-all">Edit</button>
        <button onclick="confirmDeleteProfile(${id},'${esc(profile.name).replace(/'/g,"\\'")}',true)" class="text-[11px] font-semibold uppercase tracking-wider text-error px-4 py-2 border border-error/20 rounded-lg hover:bg-error/10 transition-all">Delete</button>
      </div>
    </div>
  `;

  // Verification panel
  const panel = document.getElementById('verificationPanel');
  panel.innerHTML = `
    <div>
      <div class="flex items-center justify-between mb-4">
        <h4 class="font-playfair text-lg text-on-surface">Verification</h4>
        <span class="material-symbols-outlined text-primary">verified</span>
      </div>
      <p class="text-[11px] uppercase tracking-wider text-on-surface-variant mb-3 font-semibold">Identity Document</p>
      ${profile.id_card_path ? `
        <div class="id-card-wrap relative rounded-lg overflow-hidden border border-outline-variant/15 cursor-zoom-in bg-surface-container-highest" onclick="openLightbox('${profile.id_card_path}')">
          <img src="${profile.id_card_path}" alt="ID Card" class="w-full h-48 object-cover opacity-70 grayscale transition-all duration-500">
          <div class="id-card-overlay absolute inset-0 flex items-center justify-center bg-background/50">
            <span class="bg-primary text-on-primary text-xs font-semibold px-4 py-2 rounded-lg flex items-center gap-2">
              <span class="material-symbols-outlined text-[16px]">visibility</span> View Original
            </span>
          </div>
        </div>
        <p class="text-xs text-on-surface-variant mt-2 flex items-center justify-between">
          <span>${profile.id_card_path.split('/').pop()}</span>
          <span class="text-primary">On file</span>
        </p>
      ` : `
        <div class="upload-zone p-8 text-center bg-white/[0.02] flex flex-col items-center gap-3 cursor-pointer hover:bg-white/[0.04] transition-all" onclick="openEditProfile(${id})">
          <span class="material-symbols-outlined text-outline text-3xl">badge</span>
          <p class="text-xs text-outline">No document on file — click Edit to upload</p>
        </div>
      `}
    </div>
    ${profile.pp_urn ? `
    <div class="space-y-3">
      <p class="text-[11px] uppercase tracking-wider text-on-surface-variant font-semibold">Registry Identifiers</p>
      <div class="glass-surface rounded-lg px-4 py-3">
        <p class="text-[11px] uppercase tracking-wider text-on-surface-variant/60 mb-1">PP URN</p>
        <p class="text-sm font-mono text-on-surface">${esc(profile.pp_urn)}</p>
      </div>
    </div>` : ''}
    <!-- Company Documentation -->
    <div id="companyDocsSection">
      <div class="flex items-center justify-between mb-3">
        <p class="text-[11px] uppercase tracking-wider text-on-surface-variant font-semibold">Company Documentation</p>
        <button onclick="openAddCompanyDoc(${id})" class="w-6 h-6 rounded-md bg-primary/10 hover:bg-primary/20 flex items-center justify-center transition-all group" title="Add document">
          <span class="material-symbols-outlined text-primary text-[16px]">add</span>
        </button>
      </div>
      <div id="companyDocTiles" class="flex flex-col gap-2">
        ${renderCompanyDocTiles(companyDocs, id)}
      </div>
    </div>
  `;

  document.getElementById('addWatchForProfileBtn').onclick = () => openAddWatch(id);
  renderProfilePnl(profile);
  renderProfileWatches(profile.watches, profile);
}
