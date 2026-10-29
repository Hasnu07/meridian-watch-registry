// 99-boot.js — Boot
// Part of the dashboard script: scripts/build.js concatenates src/dashboard/*.js
// in filename order into public/js/dashboard.js (one classic script, so
// functions and top-level variables stay shared exactly as before).

// ── Boot ───────────────────────────────────────────────────────────────────
// Wait for /api/auth/me so role-specific chrome (and page guards) are in
// place before the first page loads its data.
_userReady.then(() => showPage('dashboard'));
