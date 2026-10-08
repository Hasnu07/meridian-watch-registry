// 09-company-docs.js — Company documentation
// Part of the dashboard script: scripts/build.js concatenates src/dashboard/*.js
// in filename order into public/js/dashboard.js (one classic script, so
// functions and top-level variables stay shared exactly as before).

// ── Company Documentation ──────────────────────────────────────────────────

function isPdf(path) { return path?.toLowerCase().endsWith('.pdf'); }

function renderCompanyDocTiles(docs, profileId) {
  if (!docs.length) return `
    <div class="upload-zone p-5 text-center bg-white/[0.02] flex flex-col items-center gap-2">
      <span class="material-symbols-outlined text-outline text-2xl">domain</span>
      <p class="text-xs text-outline">No company documents yet</p>
    </div>`;
  return docs.map(doc => `
    <div class="group glass-surface rounded-lg px-4 py-3 flex items-center gap-3 cursor-pointer hover:border-primary/30 hover:bg-primary/[0.03] transition-all border border-transparent"
         onclick="${isPdf(doc.doc_path) ? `window.open('${doc.doc_path}','_blank')` : `openLightbox('${doc.doc_path}')`}">
      <div class="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
        <span class="material-symbols-outlined text-primary text-[18px]">${isPdf(doc.doc_path) ? 'picture_as_pdf' : 'image'}</span>
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-semibold text-on-surface truncate">${esc(doc.shop_name)}</p>
        <p class="text-[11px] text-on-surface-variant truncate">${doc.doc_path.split('/').pop()}</p>
      </div>
      <button onclick="event.stopPropagation(); deleteCompanyDoc(${doc.id}, ${profileId})"
              class="opacity-60 group-hover:opacity-100 focus-within:opacity-100 w-6 h-6 flex items-center justify-center rounded-md hover:bg-error/20 transition-all flex-shrink-0"
              title="Remove">
        <span class="material-symbols-outlined text-error text-[16px]">close</span>
      </button>
    </div>`).join('');
}

function openAddCompanyDoc(profileId) {
  document.getElementById('cdocProfileId').value = profileId;
  document.getElementById('cdocShopName').value  = '';
  document.getElementById('cdocFile').value      = '';
  document.getElementById('cdocFileChosen').classList.add('hidden');
  document.getElementById('cdocError').classList.add('hidden');
  document.getElementById('companyDocModal').classList.remove('hidden');
  document.getElementById('cdocShopName').focus();
}

function closeCompanyDocModal() {
  document.getElementById('companyDocModal').classList.add('hidden');
}

document.getElementById('closeCompanyDocModal').addEventListener('click', closeCompanyDocModal);
document.getElementById('cancelCompanyDocModal').addEventListener('click', closeCompanyDocModal);

document.getElementById('cdocFile').addEventListener('change', e => {
  const fc = document.getElementById('cdocFileChosen');
  if (e.target.files[0]) { fc.textContent = '✓ ' + e.target.files[0].name; fc.classList.remove('hidden'); }
  else fc.classList.add('hidden');
});

document.getElementById('saveCompanyDocBtn').addEventListener('click', async () => {
  const profileId = document.getElementById('cdocProfileId').value;
  const shopName  = document.getElementById('cdocShopName').value.trim();
  const file      = document.getElementById('cdocFile').files[0];
  const errEl     = document.getElementById('cdocError');
  errEl.classList.add('hidden');

  if (!shopName) { errEl.textContent = 'Shop name is required'; errEl.classList.remove('hidden'); return; }
  if (!file)     { errEl.textContent = 'Please select a document'; errEl.classList.remove('hidden'); return; }

  const fd = new FormData();
  fd.append('shop_name', shopName);
  fd.append('document',  file);

  try {
    await api('POST', `/api/profiles/${profileId}/company-docs`, fd);
    closeCompanyDocModal();
    // Refresh company docs tiles in place
    const docs = await api('GET', `/api/profiles/${profileId}/company-docs`);
    const tilesEl = document.getElementById('companyDocTiles');
    if (tilesEl) tilesEl.innerHTML = renderCompanyDocTiles(docs, Number(profileId));
  } catch (e) {
    errEl.textContent = e.message; errEl.classList.remove('hidden');
  }
});

async function deleteCompanyDoc(docId, profileId) {
  try {
    await api('DELETE', `/api/profiles/${profileId}/company-docs/${docId}`);
    const docs = await api('GET', `/api/profiles/${profileId}/company-docs`);
    const tilesEl = document.getElementById('companyDocTiles');
    if (tilesEl) tilesEl.innerHTML = renderCompanyDocTiles(docs, profileId);
  } catch (e) {
    alert(e.message);
  }
}

document.getElementById('backToProfiles').addEventListener('click', () => {
  const f = _profileDetailFrom;
  if (!f) { showPage('profiles'); return; }
  if (f.page === 'portfolio-detail' && f.id) openPortfolioDetail(f.id);
  else if (f.page === 'shop-detail'  && f.id) openShopDetail(f.id);
  else if (f.page === 'client-detail'&& f.id) openClientDetail(f.id);
  else showPage('profiles');
});
