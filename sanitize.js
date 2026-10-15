/* Allow-list HTML sanitiser for rich body text (editor output, saved memos, pasted/AI content). */
(function () {
  'use strict';
  var PNP = window.PNP;
  var OKT = { B: 1, STRONG: 1, I: 1, EM: 1, U: 1, SPAN: 1, DIV: 1, P: 1, BR: 1, UL: 1, OL: 1, LI: 1, FONT: 1, TABLE: 1, TBODY: 1, THEAD: 1, TR: 1, TD: 1, TH: 1, COLGROUP: 1, COL: 1, IMG: 1, SUB: 1, SUP: 1 };
  var SAFE = /^[#\w\s,.()%'"-]{1,80}$/, BADVAL = /url|expression|javascript|\\/i;
  var IMG_SRC = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+\/=]+$/;
  var STYLE_KEYS = ['color', 'fontSize', 'fontFamily', 'fontWeight', 'fontStyle', 'textAlign', 'backgroundColor', 'lineHeight', 'verticalAlign'];

  function ok(v) { return v && SAFE.test(v) && !BADVAL.test(v); }

  function clean(html) {
    var d = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html'), out = document.createElement('div');
    (function cl(src, dst) {
      Array.prototype.forEach.call(src.childNodes, function (n) {
        if (n.nodeType === 3) { dst.appendChild(document.createTextNode(n.nodeValue)); return; }
        if (n.nodeType !== 1) return;
        var t = n.tagName;
        if (t === 'SCRIPT' || t === 'STYLE') return;
        if (t === 'IMG') {
          var src = n.getAttribute('src') || '';
          if (!IMG_SRC.test(src)) return;
          var im = document.createElement('img');
          im.setAttribute('src', src);
          im.setAttribute('alt', (n.getAttribute('alt') || '').slice(0, 120));
          var w = parseFloat(n.getAttribute('data-w'));
          if (w >= 5 && w <= 100) { w = Math.round(w * 10) / 10; im.setAttribute('data-w', String(w)); im.style.width = w + '%'; }
          var al = n.getAttribute('data-align');
          if (al === 'left' || al === 'center' || al === 'right') im.setAttribute('data-align', al);
          var gx = parseFloat(n.getAttribute('data-x')), gy = parseFloat(n.getAttribute('data-y'));   /* manual placement (px from the normal spot) */
          if (isFinite(gx) || isFinite(gy)) {
            gx = Math.round(Math.max(-800, Math.min(800, gx || 0))); gy = Math.round(Math.max(-800, Math.min(800, gy || 0)));
            im.setAttribute('data-x', String(gx)); im.setAttribute('data-y', String(gy));
            im.style.position = 'relative'; im.style.left = gx + 'px'; im.style.top = gy + 'px';
          }
          dst.appendChild(im); return;
        }
        if (!OKT[t]) { cl(n, dst); return; }
        var e = document.createElement(t === 'FONT' ? 'span' : t.toLowerCase());
        STYLE_KEYS.forEach(function (k) { var v = n.style && n.style[k]; if (ok(v)) e.style[k] = v; });
        if (!/^(sub|super)$/.test(e.style.verticalAlign)) e.style.verticalAlign = '';   /* only subscript / superscript */
        var td = n.style && (n.style.textDecorationLine || n.style.textDecoration);
        if (td) { var tds = []; if (/underline/.test(td)) tds.push('underline'); if (/line-through/.test(td)) tds.push('line-through'); if (tds.length) e.style.textDecoration = tds.join(' '); }
        if (t === 'COL') { var cw = parseFloat(n.getAttribute('data-w')); if (cw >= 2 && cw <= 98) { cw = Math.round(cw * 100) / 100; e.setAttribute('data-w', String(cw)); e.style.width = cw + '%'; } }   /* table column width (%) */
        if ((t === 'DIV' || t === 'P') && /^[1-6]$/.test(n.getAttribute('data-ind') || '')) e.setAttribute('data-ind', n.getAttribute('data-ind'));
        if (t === 'OL' && /^(1|a|A|i|I)$/.test(n.getAttribute('type') || '')) e.setAttribute('type', n.getAttribute('type'));
        if (t === 'FONT') {
          var c = n.getAttribute('color'), f = n.getAttribute('face');
          if (ok(c)) e.style.color = c;
          if (ok(f)) e.style.fontFamily = f;
        }
        cl(n, e); dst.appendChild(e);
      });
    })(d.body, out);
    return out.innerHTML;
  }

  /* Plain text (typed in older versions) or HTML -> safe HTML. */
  PNP.toHtml = function (v) {
    v = v || '';
    return /<[a-z!\/]/i.test(v) ? clean(v) : PNP.esc(v).replace(/\r?\n/g, '<br>');
  };
  PNP.clean = clean;

  /* Sections -> the single body HTML shown in the document. Empty sections are skipped. */
  PNP.joinSections = function (sections) {
    return (sections || []).filter(function (h) { return h.replace(/<[^>]*>/g, '').trim() !== '' || /<(table|img)/i.test(h); })
      .map(PNP.toHtml).join('<div><br></div>');
  };

  /* HTML -> readable plain text (used for AI input, search and Excel export). */
  PNP.plain = function (html) {
    var root = document.createElement('div'); root.innerHTML = PNP.toHtml(html);
    var out = '', BLOCK = /^(DIV|P|LI|TR|TABLE|UL|OL)$/;
    (function walk(n, ctx) {
      if (n.nodeType === 3) { out += n.nodeValue.replace(/\u00a0/g, ' ').replace(/[\r\n]+/g, ' '); return; }
      if (n.nodeType !== 1) return;
      var t = n.tagName;
      if (t === 'BR') { out += '\n'; return; }
      if (t === 'IMG') return;
      var ctx2 = ctx;
      if (t === 'UL' || t === 'OL') ctx2 = { type: t, n: 0 };
      if (t === 'LI') { if (out && !/\n$/.test(out)) out += '\n'; ctx.n++; out += (ctx.type === 'OL' ? ctx.n + '. ' : '\u2022 '); }
      if (t === 'TD' || t === 'TH') { if (n.previousElementSibling) out += ' | '; }
      Array.prototype.forEach.call(n.childNodes, function (c) { walk(c, ctx2); });
      if (BLOCK.test(t) && !/\n$/.test(out)) out += '\n';
    })(root, { type: 'UL', n: 0 });
    return out.replace(/\n{3,}/g, '\n\n').trim();
  };
})();
