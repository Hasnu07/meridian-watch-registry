// 23-wishlist-group.js — keep wishlist pieces out of the way in watch lists
// Every watch list (client membership tables, membership page, shop/portfolio
// expanded rows, Watches "All") puts owned pieces first and groups wishlist
// pieces at the end behind one "Wishlist · N — Show / Hide" toggle. The choice
// is shared by all lists and remembered per browser (hidden by default).
// Part of the dashboard script: scripts/build.js concatenates src/dashboard/*.js
// in filename order into public/js/dashboard.js (one classic script, so
// functions and top-level variables stay shared exactly as before).

let _wlHidden = (() => {
  try { return localStorage.getItem('meridian.hideWishlist') !== '0'; } catch { return true; }
})();

function wishlistToggleHtml(count) {
  return `<button type="button" class="wl-toggle" data-wl-toggle aria-expanded="${!_wlHidden}" title="Show or hide wishlist pieces in every list">
    <span class="material-symbols-outlined wl-star">bookmark</span>
    <span>Wishlist</span><span class="wl-count">${count}</span>
    <span class="wl-sub">${count === 1 ? 'watch' : 'watches'} not bought yet</span>
    <span class="wl-state"><span class="material-symbols-outlined wl-icon">${_wlHidden ? 'visibility' : 'visibility_off'}</span><span class="wl-label">${_wlHidden ? 'Show' : 'Hide'}</span></span>
  </button>`;
}

// Table rows: owned first, then the toggle row, then (hideable) wishlist rows
function groupWishlistRows(watches, rowFn, colspan) {
  const owned = watches.filter(w => w.status !== 'wishlist');
  const wish  = watches.filter(w => w.status === 'wishlist');
  const html = owned.map(rowFn).join('');
  if (!wish.length) return html;
  return html
    + `<tr class="wl-group-row"><td colspan="${colspan}">${wishlistToggleHtml(wish.length)}</td></tr>`
    + wish.map(w => rowFn(w).replace(/<tr\b/g, '<tr data-wl-row')).join('');   // every row of the piece (incl. expandable detail rows)
}

function applyWishlistVisibility() {
  document.documentElement.classList.toggle('wl-hidden', _wlHidden);
  document.querySelectorAll('[data-wl-toggle]').forEach(b => {
    b.setAttribute('aria-expanded', String(!_wlHidden));
    const icon = b.querySelector('.wl-icon'), label = b.querySelector('.wl-label');
    if (icon) icon.textContent = _wlHidden ? 'visibility' : 'visibility_off';
    if (label) label.textContent = _wlHidden ? 'Show' : 'Hide';
  });
}
function setWishlistHidden(hidden) {
  _wlHidden = hidden;
  try { localStorage.setItem('meridian.hideWishlist', hidden ? '1' : '0'); } catch {}
  applyWishlistVisibility();
  // The Watches list paginates, so it filters instead of hiding rows: re-render it
  if (currentPage === 'watches') { watchPage = 1; renderWatches(); }
}
document.addEventListener('click', e => {
  if (e.target.closest('[data-wl-toggle]')) setWishlistHidden(!_wlHidden);
});
applyWishlistVisibility();
