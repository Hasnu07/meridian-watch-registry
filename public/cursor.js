/* Neon cursor — drawn on ONE transparent full-screen <canvas>.
   The canvas is wiped and redrawn every frame, so the cursor can never leave
   trails or repaint artifacts behind (earlier versions moved glowing DOM
   elements, which some GPU/driver combos failed to clean up).

   Behaviour:
   • Dot sits exactly on the pointer (precision stays native).
   • Ring trails smoothly. Over a button / tab / chip / link it MORPHS into
     that element's shape (size + corner radius), outlining it in neon pink
     and leaning slightly toward the pointer. Over big clickable areas
     (cards, rows) it becomes a pink spinning dashed reticle.
   • Click: squeeze + ripple. Text fields get the normal I-beam back.
   • Off on touch / coarse pointers. prefers-reduced-motion: ring snaps,
     no ripples, no spinning.
   • Modes: neon (default) or normal system cursor —
     window.setNeonCursor(true|false), remembered per browser in
     localStorage "meridian.neonCursor" ("0" = normal). Fires a
     "neoncursorchange" event on window so toggles stay in sync. */
(function () {
  'use strict';
  if (!window.matchMedia || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  var KEY = 'meridian.neonCursor';
  var reduce = matchMedia('(prefers-reduced-motion: reduce)');
  var root = document.documentElement;
  var CLICKABLE = 'a[href], button, [role="button"], [role="switch"], [onclick], label[for], select, summary, .neon-sign, input[type="checkbox"], input[type="radio"], input[type="file"], input[type="submit"], input[type="button"], input[type="range"], [data-page], [tabindex]:not([tabindex="-1"])';
  var TEXTY = 'input:not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="submit"]):not([type="button"]):not([type="range"]):not([type="color"]), textarea, [contenteditable=""], [contenteditable="true"]';
  var MORPH_MAX_W = 380, MORPH_MAX_H = 96, PAD = 5, RING = 32;
  var CYAN = [34, 211, 255], PINK = [255, 61, 203], GREY = [131, 146, 168];

  function isOn() { try { return localStorage.getItem(KEY) !== '0'; } catch (e) { return true; } }

  var canvas, ctx, dpr = 1, vw = 0, vh = 0;
  var enabled = false, visible = false, raf = 0;
  var x = -100, y = -100;                                     // pointer
  var rx = -100, ry = -100, rw = RING, rh = RING, rr = RING / 2; // ring (animated)
  var target = null, targetRadius = 0;                        // morph target
  var mode = 'idle';                                          // idle | morph | reticle | disabled | text
  var down = false, scale = 1, pink = 0, spin = 0, lastT = 0;
  var ripples = [];

  function build() {
    if (canvas) return;
    canvas = document.createElement('canvas');
    canvas.className = 'nc-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
    resize();
  }
  function resize() {
    if (!canvas) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    vw = window.innerWidth; vh = window.innerHeight;
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    canvas.style.width = vw + 'px';
    canvas.style.height = vh + 'px';
    schedule();
  }

  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function mix(a, b, t) { return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)]; }
  function roundRect(cx, cy, w, h, r) {
    var x0 = cx - w / 2, y0 = cy - h / 2;
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x0 + r, y0);
    ctx.arcTo(x0 + w, y0, x0 + w, y0 + h, r);
    ctx.arcTo(x0 + w, y0 + h, x0, y0 + h, r);
    ctx.arcTo(x0, y0 + h, x0, y0, r);
    ctx.arcTo(x0, y0, x0 + w, y0, r);
    ctx.closePath();
  }

  function frame(t) {
    raf = 0;
    if (!enabled || !ctx) return;
    var dt = lastT ? Math.min(64, t - lastT) : 16; lastT = t;
    var still = reduce.matches;

    // ── targets for this frame ──
    var tx = x, ty = y, tw = RING, th = RING, tr = RING / 2;
    if (target) {
      var r = target.getBoundingClientRect();
      if (!r.width || !r.height || !target.isConnected) { setTarget(null); }
      else {
        var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        tx = cx + (x - cx) * 0.12; ty = cy + (y - cy) * 0.12;   // magnetic lean
        tw = r.width + PAD * 2; th = r.height + PAD * 2;
        tr = Math.min(targetRadius + PAD, th / 2);
      }
    }
    var tScale = mode === 'reticle' ? (down ? 1.1 : 1.45) : mode === 'disabled' ? 0.85 : mode === 'morph' ? (down ? 0.96 : 1) : (down ? 0.72 : 1);
    var tPink = (mode === 'morph' || mode === 'reticle') ? 1 : 0;

    var k = still ? 1 : 0.22, ks = still ? 1 : 0.26, kc = still ? 1 : 0.2;
    rx += (tx - rx) * k;  ry += (ty - ry) * k;
    rw += (tw - rw) * ks; rh += (th - rh) * ks; rr += (tr - rr) * ks;
    scale += (tScale - scale) * kc;
    pink += (tPink - pink) * kc;
    if (mode === 'reticle' && !still) spin += dt * 0.11;      // dash march (px)

    // ── draw ──
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, vw, vh);                              // full wipe: no trails, ever
    var show = visible && mode !== 'text';
    if (show) {
      var col = mode === 'disabled' ? GREY : mix(CYAN, PINK, pink);
      var w = rw * scale, h = rh * scale;
      // ring / morph outline
      roundRect(rx, ry, w, h, rr * scale);
      if (mode === 'morph' || mode === 'reticle') {
        ctx.fillStyle = rgba(PINK, down ? 0.14 : 0.06 * pink);
        ctx.fill();
      }
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = rgba(col, mode === 'disabled' ? 0.6 : 0.9);
      ctx.shadowColor = rgba(col, mode === 'disabled' ? 0 : 0.75);
      ctx.shadowBlur = 8;
      if (mode === 'reticle' && !down) { ctx.setLineDash([5, 4]); ctx.lineDashOffset = -spin; }
      else ctx.setLineDash([]);
      ctx.stroke();
      ctx.setLineDash([]);
      // dot
      var dotCol = mode === 'disabled' ? GREY : mix(CYAN, PINK, pink);
      var dotR = 3 * (down ? 0.8 : mode === 'reticle' ? 1.3 : mode === 'morph' ? 0.9 : 1);
      ctx.beginPath(); ctx.arc(x, y, dotR, 0, Math.PI * 2);
      ctx.fillStyle = mode === 'disabled' ? rgba(GREY, 1) : (pink > 0.5 ? '#FFE3F7' : '#EAFDFF');
      ctx.shadowColor = rgba(dotCol, mode === 'disabled' ? 0 : 0.95);
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = rgba(dotCol, 0.9); ctx.shadowBlur = 0; ctx.stroke();
    }
    // ripples
    for (var i = ripples.length - 1; i >= 0; i--) {
      var rp = ripples[i];
      rp.age += dt;
      var p = rp.age / 500;
      if (p >= 1) { ripples.splice(i, 1); continue; }
      var e = 1 - Math.pow(1 - p, 3);
      ctx.beginPath(); ctx.arc(rp.x, rp.y, 6 + e * 27, 0, Math.PI * 2);
      ctx.lineWidth = 2;
      ctx.strokeStyle = rgba(rp.c, 0.9 * (1 - p));
      ctx.shadowColor = rgba(rp.c, 0.8 * (1 - p)); ctx.shadowBlur = 8;
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    var moving = Math.abs(tx - rx) > 0.15 || Math.abs(ty - ry) > 0.15 || Math.abs(tw - rw) > 0.15 || Math.abs(th - rh) > 0.15 ||
                 Math.abs(tScale - scale) > 0.005 || Math.abs(tPink - pink) > 0.01;
    if (moving || target || ripples.length || (mode === 'reticle' && !still)) raf = requestAnimationFrame(frame);
    else lastT = 0;
  }
  function schedule() { if (!raf && enabled) raf = requestAnimationFrame(frame); }

  function setTarget(el) {
    target = el;
    if (el) {
      var cs = getComputedStyle(el);
      targetRadius = cs.borderTopLeftRadius.indexOf('%') > -1
        ? Math.min(el.offsetWidth, el.offsetHeight) / 2
        : (parseFloat(cs.borderTopLeftRadius) || 0);
    }
    schedule();
  }

  function onMove(e) {
    x = e.clientX; y = e.clientY;
    if (!visible) { rx = x; ry = y; visible = true; }
    schedule();
  }
  function onOver(e) {
    var t = e.target;
    if (!(t instanceof Element)) return;
    var texty = t.closest(TEXTY);
    // Inside a chart the plain ring reads better than a reticle (the chart has its own crosshair)
    var hit = texty || t.closest('.vd-chart') ? null : t.closest(CLICKABLE);
    var disabled = !!hit && (hit.disabled || hit.getAttribute('aria-disabled') === 'true');
    var morph = null;
    if (hit && !disabled) {
      var r = hit.getBoundingClientRect();
      if (r.width <= MORPH_MAX_W && r.height <= MORPH_MAX_H) morph = hit;
    }
    mode = texty ? 'text' : disabled ? 'disabled' : morph ? 'morph' : hit ? 'reticle' : 'idle';
    root.classList.toggle('nc-text', !!texty);
    if (morph !== target) setTarget(morph); else schedule();
  }
  function onDown(e) {
    if (e.button !== 0) return;
    down = true;
    if (!reduce.matches && mode !== 'text') {
      ripples.push({ x: e.clientX, y: e.clientY, age: 0, c: (mode === 'morph' || mode === 'reticle') ? PINK : CYAN });
      if (ripples.length > 4) ripples.shift();
    }
    schedule();
  }
  function onUp() { down = false; schedule(); }
  function onHide() { down = false; visible = false; target = null; ripples = []; schedule(); }
  function onLeave(e) { if (!e.relatedTarget) onHide(); }
  function onVisibility() { if (document.hidden) onHide(); }
  function onScroll() { if (target) schedule(); }

  function enable() {
    if (enabled) return;
    if (!document.body) return document.addEventListener('DOMContentLoaded', enable, { once: true });
    build();
    enabled = true;
    canvas.style.display = '';
    root.classList.add('neon-cursor');
    document.addEventListener('mousemove', onMove, { passive: true });
    document.addEventListener('mouseover', onOver, { passive: true });
    document.addEventListener('mousedown', onDown, { passive: true });
    document.addEventListener('mouseup', onUp, { passive: true });
    document.addEventListener('mouseout', onLeave, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    window.addEventListener('resize', resize);
    window.addEventListener('blur', onHide);
  }
  function disable() {
    enabled = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0; lastT = 0;
    target = null; ripples = []; visible = false; down = false; mode = 'idle';
    if (ctx) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); }
    if (canvas) canvas.style.display = 'none';
    root.classList.remove('neon-cursor', 'nc-text');
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseover', onOver);
    document.removeEventListener('mousedown', onDown);
    document.removeEventListener('mouseup', onUp);
    document.removeEventListener('mouseout', onLeave);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('scroll', onScroll, { capture: true });
    window.removeEventListener('resize', resize);
    window.removeEventListener('blur', onHide);
  }

  window.setNeonCursor = function (on) {
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) {}
    on ? enable() : disable();
    try { window.dispatchEvent(new CustomEvent('neoncursorchange', { detail: { on: !!on } })); } catch (e) {}
  };
  window.neonCursorEnabled = isOn;

  // Another tab / the Patek Desk iframe changed the mode: follow it
  window.addEventListener('storage', function (e) {
    if (e.key !== KEY) return;
    var on = e.newValue !== '0';
    on ? enable() : disable();
    try { window.dispatchEvent(new CustomEvent('neoncursorchange', { detail: { on: on } })); } catch (err) {}
  });

  if (isOn()) enable();
})();
