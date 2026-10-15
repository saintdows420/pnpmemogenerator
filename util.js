/* Shared helpers. Everything hangs off one global namespace: window.PNP. */
(function () {
  'use strict';
  var PNP = (window.PNP = window.PNP || {});

  PNP.$ = function (id) { return document.getElementById(id); };
  /* Colour menu in the style of Word / Google Docs: theme colours with tints and shades, standard colours, More Colors.
     One menu serves the ribbon (font colour, highlight) and the classification colour. */
  PNP.colorMenu = (function () {
    var THEME = ['#FFFFFF', '#000000', '#E7E6E6', '#44546A', '#4472C4', '#ED7D31', '#A5A5A5', '#FFC000', '#5B9BD5', '#70AD47'];
    var STD = ['#C00000', '#FF0000', '#FFC000', '#FFFF00', '#92D050', '#00B050', '#00B0F0', '#0070C0', '#002060', '#7030A0'];
    var NAMES = { FFFFFF: 'White', '000000': 'Black', E7E6E6: 'Light Gray', '44546A': 'Dark Blue-Gray', '4472C4': 'Blue', ED7D31: 'Orange', A5A5A5: 'Gray', FFC000: 'Gold', '5B9BD5': 'Light Blue', '70AD47': 'Green',
      C00000: 'Dark Red', FF0000: 'Red', FFFF00: 'Yellow', '92D050': 'Light Green', '00B050': 'Green', '00B0F0': 'Sky Blue', '0070C0': 'Blue', '002060': 'Dark Blue', '7030A0': 'Purple' };
    var bound = false;
    function hex(a) { return '#' + a.map(function (v) { return ('0' + Math.round(v).toString(16)).slice(-2); }).join('').toUpperCase(); }
    function mix(h, white, p) { var t = white ? 255 : 0; return hex([1, 3, 5].map(function (i) { var v = parseInt(h.substr(i, 2), 16); return v + (t - v) * p; })); }
    function tint(h, r) {   /* rows under a theme colour: 3 lighter, 2 darker (white and black get grays) */
      if (h === '#FFFFFF') return mix(h, false, [0.05, 0.15, 0.25, 0.35, 0.5][r - 1]);
      if (h === '#000000') return mix(h, true, [0.5, 0.35, 0.25, 0.15, 0.05][r - 1]);
      return r <= 3 ? mix(h, true, [0.8, 0.6, 0.4][r - 1]) : mix(h, false, [0.25, 0.5][r - 4]);
    }
    function pal() { return document.getElementById('palette'); }
    function close() { var p = pal(); if (p) p.hidden = true; }
    function name(h) { h = String(h || '').toUpperCase().replace('#', ''); return NAMES[h] || '#' + h; }
    function make(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt) e.textContent = txt; return e; }
    function open(anchor, o) {
      var p = pal(), cur = String(o.current || '').toUpperCase(); p.innerHTML = '';
      function item(label, chip, fn) {
        var b = make('button', 'cmItem'); b.type = 'button'; var c = make('span', 'cmChip'); if (chip) c.style.background = chip; b.appendChild(c); b.appendChild(make('span', '', label));
        b.addEventListener('mousedown', function (e) { e.preventDefault(); }); b.addEventListener('click', function () { close(); fn(); }); return b;
      }
      function sw(h) {
        var b = make('button', 'cmSw' + (h === cur ? ' on' : '')); b.type = 'button'; b.style.background = h; b.title = name(h) + ' ' + h; b.setAttribute('aria-label', name(h));
        b.addEventListener('mousedown', function (e) { e.preventDefault(); }); b.addEventListener('click', function () { close(); o.onPick(h.toLowerCase()); }); return b;
      }
      if (o.none) p.appendChild(item(o.none.label, o.none.chip || null, function () { o.onPick(o.none.value); }));
      p.appendChild(make('div', 'cmTitle', 'Theme Colors'));
      var g = make('div', 'cmGrid'); for (var r = 0; r < 6; r++) THEME.forEach(function (h) { g.appendChild(sw(r === 0 ? h : tint(h, r))); }); p.appendChild(g);
      p.appendChild(make('div', 'cmTitle', 'Standard Colors'));
      var s = make('div', 'cmGrid'); STD.forEach(function (h) { s.appendChild(sw(h)); }); p.appendChild(s);
      var more = item('More Colors\u2026', '#ffffff', o.more); more.style.marginTop = '8px'; more.firstChild.style.background = 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)'; p.appendChild(more);
      p.hidden = false;
      var r2 = anchor.getBoundingClientRect(), w = p.offsetWidth, h2 = p.offsetHeight;
      var left = Math.max(8, Math.min(r2.left, window.innerWidth - w - 8)), top = r2.bottom + 6;
      if (top + h2 > window.innerHeight - 8) top = Math.max(8, r2.top - h2 - 6);
      p.style.left = left + 'px'; p.style.top = top + 'px';
      if (!bound) {
        bound = true;
        document.addEventListener('mousedown', function (e) { var q = pal(); if (q && !q.hidden && !q.contains(e.target)) close(); });
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
        window.addEventListener('resize', close);
      }
    }
    return { open: open, close: close, name: name };
  })();
  PNP.esc = function (t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };

  PNP.fmtDate = function (v) {
    if (!v) return '';
    var d = new Date(v + 'T00:00:00');
    if (isNaN(d)) return '';
    return d.toLocaleDateString('en-US', { month: 'long' }) + ' ' + String(d.getDate()).padStart(2, '0') + ', ' + d.getFullYear();
  };
  PNP.todayISO = function () {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  PNP.debounce = function (fn, ms) {
    var t; return function () { var a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms); };
  };

  var toastTimer;
  PNP.toast = function (text, ms) {
    var el = PNP.$('toast'); if (!el) return;
    el.textContent = text; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.hidden = true; }, ms || 4500);
  };
  /* Persist small UI preferences; storage can be blocked, so never throw. */
  PNP.pref = {
    get: function (k) { try { return localStorage.getItem('pnp.' + k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem('pnp.' + k, v); } catch (e) { /* ignore */ } },
    del: function (k) { try { localStorage.removeItem('pnp.' + k); } catch (e) { /* ignore */ } },
  };
})();
