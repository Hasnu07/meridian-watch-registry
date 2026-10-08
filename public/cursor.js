/* Neon cursor — a precise neon dot plus a trailing glow ring.
   • Dot sits exactly on the pointer (precision stays native).
   • Ring trails smoothly; over anything clickable it grows, turns pink and
     spins like a reticle; on click it squeezes and fires a ripple.
   • Text fields get the normal I-beam back (custom cursor hides there).
   • Off on touch / coarse pointers. With prefers-reduced-motion the ring
     snaps to the pointer and there are no ripples or spinning.
   • Toggle: window.setNeonCursor(true|false) — remembered per browser
     (localStorage "meridian.neonCursor"; "0" = off). Styles live in neon.css. */
(function () {
  'use strict';
  if (!window.matchMedia || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  var KEY = 'meridian.neonCursor';
  var reduce = matchMedia('(prefers-reduced-motion: reduce)');
  var root = document.documentElement;
  var CLICKABLE = 'a[href], button, [role="button"], [onclick], label[for], select, summary, .neon-sign, input[type="checkbox"], input[type="radio"], input[type="file"], input[type="submit"], input[type="button"], input[type="range"], [data-page], [tabindex]:not([tabindex="-1"])';
  var TEXTY = 'input:not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="submit"]):not([type="button"]):not([type="range"]):not([type="color"]), textarea, [contenteditable=""], [contenteditable="true"]';

  function isOn() { try { return localStorage.getItem(KEY) !== '0'; } catch (e) { return true; } }

  var dot, ring, shape, x = -100, y = -100, rx = -100, ry = -100, raf = 0, visible = false, built = false;

  function build() {
    if (built) return;
    built = true;
    dot = document.createElement('div');
    dot.className = 'nc-dot';
    ring = document.createElement('div');
    ring.className = 'nc-ring';
    shape = document.createElement('div');
    shape.className = 'nc-ring-shape';
    ring.appendChild(shape);
    [dot, ring].forEach(function (el) { el.setAttribute('aria-hidden', 'true'); document.body.appendChild(el); });
  }

  function place() {
    dot.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
    var k = reduce.matches ? 1 : 0.2;                      // trailing amount
    rx += (x - rx) * k; ry += (y - ry) * k;
    ring.style.transform = 'translate3d(' + rx + 'px,' + ry + 'px,0)';
    if (Math.abs(x - rx) > 0.1 || Math.abs(y - ry) > 0.1) raf = requestAnimationFrame(place);
    else raf = 0;
  }
  function schedule() { if (!raf) raf = requestAnimationFrame(place); }

  function show(on) {
    if (visible === on) return;
    visible = on;
    root.classList.toggle('nc-visible', on);
  }

  function onMove(e) {
    x = e.clientX; y = e.clientY;
    if (!visible) { rx = x; ry = y; show(true); }
    schedule();
  }
  function onOver(e) {
    var t = e.target;
    if (!(t instanceof Element)) return;
    var texty = t.closest(TEXTY);
    var hit = !texty && t.closest(CLICKABLE);
    var disabled = hit && (hit.disabled || hit.getAttribute('aria-disabled') === 'true');
    root.classList.toggle('nc-text', !!texty);
    root.classList.toggle('nc-hover', !!hit && !disabled);
    root.classList.toggle('nc-disabled', !!disabled);
  }
  function onDown(e) {
    if (e.button !== 0) return;
    root.classList.add('nc-down');
    if (reduce.matches || root.classList.contains('nc-text')) return;
    var r = document.createElement('div');
    r.className = 'nc-ripple' + (root.classList.contains('nc-hover') ? ' is-hover' : '');
    r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px';
    r.setAttribute('aria-hidden', 'true');
    r.addEventListener('animationend', function () { r.remove(); });
    document.body.appendChild(r);
  }
  function onUp() { root.classList.remove('nc-down'); }
  function onLeave(e) { if (!e.relatedTarget) show(false); }

  function enable() {
    if (!document.body) return document.addEventListener('DOMContentLoaded', enable, { once: true });
    build();
    root.classList.add('neon-cursor');
    document.addEventListener('mousemove', onMove, { passive: true });
    document.addEventListener('mouseover', onOver, { passive: true });
    document.addEventListener('mousedown', onDown, { passive: true });
    document.addEventListener('mouseup', onUp, { passive: true });
    document.addEventListener('mouseout', onLeave, { passive: true });
    window.addEventListener('blur', onUp);
  }
  function disable() {
    root.classList.remove('neon-cursor', 'nc-visible', 'nc-hover', 'nc-text', 'nc-down', 'nc-disabled');
    visible = false;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseover', onOver);
    document.removeEventListener('mousedown', onDown);
    document.removeEventListener('mouseup', onUp);
    document.removeEventListener('mouseout', onLeave);
    window.removeEventListener('blur', onUp);
  }

  window.setNeonCursor = function (on) {
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) {}
    on ? enable() : disable();
  };
  window.neonCursorEnabled = isOn;

  if (isOn()) enable();
})();
