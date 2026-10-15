/* New memo, PDF / print actions, ChatGPT help and Add to Home Screen. */
(function () {
  'use strict';
  var PNP = window.PNP, $ = PNP.$;
  var pdfAvailable = false;


  function payload() {
    var m = PNP.app.getMemo();
    return { to: m.to, attn: m.attn, from: m.from, forLabel: m.forLabel, fileName: m.fileName, subject: m.subject, date: m.date, sections: m.sections, signatoryName: m.signatoryName,
      signatoryRank: m.signatoryRank, paperSize: m.paperSize, classification: m.classification, status: m.status };
  }

  /* Before print/PDF: save quietly when there is something new to save (same behaviour as the original app). */

  function newMemo() {
    var m = PNP.app.getMemo(), has = m.to.trim() || m.subject.trim() || PNP.plain(PNP.joinSections(m.sections)).trim();
    if (has && !confirm('Start a new memorandum? The current one is kept in History.')) return;
    PNP.history.record(m, 'draft');
    PNP.app.reset();
  }


  /* ---- Excel export (library loaded on demand: local copy first, CDN second) ---- */

  /* ---- print / PDF: one layout engine (the browser's), so both match the preview exactly ---- */
  function print() {
    Promise.resolve().then(function () {
      PNP.history.record(PNP.app.getMemo(), 'pdf');
      document.title = PNP.fileBase(PNP.app.getMemo());   /* the print dialog proposes this as the file name */
      PNP.doc.imagesReady(PNP.app.refs).then(function () { try { window.print(); } catch (e) { PNP.toast('Printing is blocked in this browser.'); } });
    });
  }
  function download() {
    Promise.resolve().then(function () {
      PNP.history.record(PNP.app.getMemo(), 'pdf');
      if (!pdfAvailable) { clientPdf(); return null; }
      PNP.toast('Creating PDF\u2026', 20000);
      return PNP.api.pdf(payload()).then(function (blob) {
        var a = document.createElement('a'), name = PNP.fileBase(PNP.app.getMemo()) + '.pdf';
        a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 10000); PNP.toast('PDF downloaded.');
      }, function () { clientPdf(); });
    });
  }

  /* ===== PDF made inside the page: no server, no print dialog, works on phones ===== */
  var PDF_FONTS = ['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique', 'Times-Roman', 'Times-Bold', 'Times-Italic', 'Times-BoldItalic', 'Courier', 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique'];
  var CP1252 = { 8364: 128, 8218: 130, 402: 131, 8222: 132, 8230: 133, 8224: 134, 8225: 135, 710: 136, 8240: 137, 352: 138, 8249: 139, 338: 140, 381: 142, 8216: 145, 8217: 146, 8220: 147, 8221: 148, 8226: 149, 8211: 150, 8212: 151, 732: 152, 8482: 153, 353: 154, 8250: 155, 339: 156, 382: 158, 376: 159 };
  function pdfEnc(str) {
    var o = '';
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i); if (c === 0xA0 || c === 0x2009 || c === 0x200B) c = 32;
      o += String.fromCharCode(c < 128 ? c : (c >= 0xA0 && c <= 0xFF ? c : (CP1252[c] || 63)));
    }
    return o.replace(/[\\()]/g, '\\$&');
  }
  /* pages: [{w, h, c: content stream, im: [image indexes]}], imgs: [{w, h, bytes(JPEG)}] -> Blob */
  function pdfBuild(pages, imgs, title) {
    var chunks = [], len = 0, offs = [];
    function put(x) { if (typeof x === 'string') { var a = new Uint8Array(x.length); for (var i = 0; i < x.length; i++) a[i] = x.charCodeAt(i) & 255; x = a; } chunks.push(x); len += x.length; }
    function obj(n, body) { offs[n] = len; put(n + ' 0 obj\n' + body + '\nendobj\n'); }
    var firstImg = 3 + PDF_FONTS.length, firstPage = firstImg + imgs.length, N = firstPage + pages.length * 2;
    put('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, '<< /Type /Pages /Kids [' + pages.map(function (_, i) { return (firstPage + i * 2) + ' 0 R'; }).join(' ') + '] /Count ' + pages.length + ' >>');
    PDF_FONTS.forEach(function (f, i) { obj(3 + i, '<< /Type /Font /Subtype /Type1 /BaseFont /' + f + ' /Encoding /WinAnsiEncoding >>'); });
    imgs.forEach(function (m, i) {
      offs[firstImg + i] = len;
      put((firstImg + i) + ' 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + m.w + ' /Height ' + m.h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + m.bytes.length + ' >>\nstream\n');
      put(m.bytes); put('\nendstream\nendobj\n');
    });
    var fontRes = PDF_FONTS.map(function (_, i) { return '/F' + i + ' ' + (3 + i) + ' 0 R'; }).join(' ');
    pages.forEach(function (pg, i) {
      var pn = firstPage + i * 2, cn = pn + 1;
      obj(pn, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + pg.w.toFixed(2) + ' ' + pg.h.toFixed(2) + '] /Resources << /Font << ' + fontRes + ' >> /XObject << ' +
        pg.im.map(function (k) { return '/Im' + k + ' ' + (firstImg + k) + ' 0 R'; }).join(' ') + ' >> >> /Contents ' + cn + ' 0 R >>');
      offs[cn] = len; put(cn + ' 0 obj\n<< /Length ' + pg.c.length + ' >>\nstream\n'); put(pg.c); put('\nendstream\nendobj\n');
    });
    obj(N, '<< /Title (' + pdfEnc(String(title).replace(/[^\x20-\x7e\u00a1-\u00ff]/g, '-')) + ') /Producer (PNP Memorandum Generator) >>');
    var xr = len, x = 'xref\n0 ' + (N + 1) + '\n0000000000 65535 f \n';
    for (var n = 1; n <= N; n++) x += ('0000000000' + offs[n]).slice(-10) + ' 00000 n \n';
    put(x + 'trailer\n<< /Size ' + (N + 1) + ' /Root 1 0 R /Info ' + N + ' 0 R >>\nstartxref\n' + xr + '\n%%EOF');
    return new Blob(chunks, { type: 'application/pdf' });
  }
  function toAlpha(n) { var s = ''; while (n > 0) { n--; s = String.fromCharCode(97 + n % 26) + s; n = Math.floor(n / 26); } return s; }
  function toRoman(n) { var m = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']], s = ''; m.forEach(function (p) { while (n >= p[0]) { s += p[1]; n -= p[0]; } }); return s; }
  function markerOf(li) {
    var par = li.parentNode; if (!par || par.tagName !== 'OL') return '\u2022';
    var i = 1, e = li; while ((e = e.previousElementSibling)) if (e.tagName === 'LI') i++;
    var t = par.getAttribute('type');
    return (t === 'a' ? toAlpha(i) : t === 'A' ? toAlpha(i).toUpperCase() : t === 'i' ? toRoman(i) : t === 'I' ? toRoman(i).toUpperCase() : String(i)) + '.';
  }
  function pdfRgb(c) {
    var m = String(c).match(/[\d.]+/g); if (!m || m.length < 3 || (m.length > 3 && parseFloat(m[3]) < 0.05)) return null;
    return [m[0] / 255, m[1] / 255, m[2] / 255].map(function (v) { return v.toFixed(3); }).join(' ');
  }
  function toPt(v) { return parseFloat(v) * (/mm$/.test(v) ? 72 / 25.4 : 72); }
  /* Reads the laid-out page (text word by word, pictures, rules, list markers) and writes PDF drawing commands. */
  function pdfPage(pg, W, H, reg) {
    var pr = pg.getBoundingClientRect(), k = W / pr.width, out = '', used = {};
    function X(v) { return ((v - pr.left) * k).toFixed(2); }
    function Y(v) { return (H - (v - pr.top) * k).toFixed(2); }
    function box(l, t, r, b, rgb) { if (rgb && r > l && b > t) out += rgb + ' rg ' + X(l) + ' ' + Y(b) + ' ' + ((r - l) * k).toFixed(2) + ' ' + ((b - t) * k).toFixed(2) + ' re f\n'; }
    function fontOf(cs) {
      var f = cs.fontFamily.toLowerCase(), fam = /courier|consolas|mono/.test(f) ? 2 : (/times|georgia|cambria|garamond|bookman|serif/.test(f) && !/sans/.test(f) ? 1 : 0);
      return fam * 4 + ((parseInt(cs.fontWeight, 10) >= 600 || cs.fontWeight === 'bold') ? 1 : 0) + (cs.fontStyle !== 'normal' ? 2 : 0);
    }
    function text(s, x, top, cs) {
      var fs = parseFloat(cs.fontSize), fi = fontOf(cs), asc = [0.905, 0.891, 0.83][Math.floor(fi / 4)];
      out += 'BT /F' + fi + ' ' + (fs * k).toFixed(2) + ' Tf ' + (pdfRgb(cs.color) || '0 0 0') + ' rg ' + X(x) + ' ' + Y(top + asc * fs) + ' Td (' + pdfEnc(s) + ') Tj ET\n';
    }
    function paint(root, cr) {   /* cr = clip box: anything outside it belongs to another page and is left out */
      var els = [root].concat(Array.prototype.slice.call(root.querySelectorAll('*')));
      els.forEach(function (e) {                                  /* backgrounds, rules and borders */
        if (e.tagName === 'IMG') return;
        var cs = getComputedStyle(e), r = e.getBoundingClientRect(); if (!r.width || !r.height || cs.visibility === 'hidden') return;
        if (cs.display !== 'inline') box(r.left, r.top, r.right, r.bottom, pdfRgb(cs.backgroundColor));
        [['Top', r.left, r.top, r.right, null], ['Bottom', r.left, null, r.right, r.bottom], ['Left', r.left, r.top, null, r.bottom], ['Right', null, r.top, r.right, r.bottom]].forEach(function (sd) {
          var w = parseFloat(cs['border' + sd[0] + 'Width']);
          if (w > 0 && cs['border' + sd[0] + 'Style'] !== 'none') {
            var c = pdfRgb(cs['border' + sd[0] + 'Color']);
            if (sd[0] === 'Top') box(r.left, r.top, r.right, r.top + w, c); else if (sd[0] === 'Bottom') { if (cs.borderBottomStyle === 'double') { box(r.left, r.bottom - w, r.right, r.bottom - w * 2 / 3, c); box(r.left, r.bottom - w / 3, r.right, r.bottom, c); } else box(r.left, r.bottom - w, r.right, r.bottom, c); }
            else if (sd[0] === 'Left') box(r.left, r.top, r.left + w, r.bottom, c); else box(r.right - w, r.top, r.right, r.bottom, c);
          }
        });
      });
      var tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), node, rg = document.createRange();
      while ((node = tw.nextNode())) {                            /* text, placed word by word at the position the browser gave it */
        if (!/\S/.test(node.nodeValue) || !node.parentNode) continue;
        var cs = getComputedStyle(node.parentNode); if (cs.visibility === 'hidden' || cs.display === 'none') continue;
        var fs = parseFloat(cs.fontSize), deco = '', el = node.parentNode;
        while (el && el !== root.parentNode) { var d = getComputedStyle(el).textDecorationLine; if (d && d !== 'none') deco += ' ' + d; el = el.parentNode; }
        var hl = cs.display === 'inline' ? pdfRgb(cs.backgroundColor) : null, line = null, word = null, bg = '', words = [], decos = [], t = node.nodeValue;
        for (var i = 0; i <= t.length; i++) {
          var ch = t.charAt(i), q = null;
          if (i < t.length && ch !== '\n' && ch !== '\r' && ch !== '\t') { rg.setStart(node, i); rg.setEnd(node, i + 1); q = rg.getClientRects()[0]; }
          if (!q) { if (word) { words.push(word); word = null; } continue; }
          if (!line || Math.abs(q.top - line.top) > 2 || q.left < line.r - 2) { if (word) { words.push(word); word = null; } if (line) decos.push(line); line = { l: q.left, r: q.right, top: q.top, b: q.bottom }; }
          else line.r = Math.max(line.r, q.right);
          if (ch === ' ' || ch === '\u00a0') { if (word) { words.push(word); word = null; } }
          else { if (!word) word = { s: '', l: q.left, top: q.top }; word.s += ch; }
        }
        if (line) decos.push(line);
        var inside = function (top) { return !cr || (top + fs * 0.55 >= cr.top && top + fs * 0.55 <= cr.bottom); };
        decos = decos.filter(function (ln) { return inside(ln.top); });
        if (hl) decos.forEach(function (ln) { box(ln.l, ln.top, ln.r, ln.b, hl); });
        words.forEach(function (w) { if (inside(w.top)) text(w.s, w.l, w.top, cs); });
        var rgb = pdfRgb(cs.color) || '0 0 0';
        decos.forEach(function (ln) {
          if (/underline/.test(deco)) box(ln.l, ln.top + fs * 1.0, ln.r, ln.top + fs * 1.0 + Math.max(0.6, fs / 14), rgb);
          if (/line-through/.test(deco)) box(ln.l, ln.top + fs * 0.62, ln.r, ln.top + fs * 0.62 + Math.max(0.6, fs / 14), rgb);
        });
      }
      Array.prototype.forEach.call(root.querySelectorAll('li'), function (li) {   /* list markers (drawn by CSS, so redrawn here) */
        var w = document.createTreeWalker(li, NodeFilter.SHOW_TEXT), n, first = null;
        while ((n = w.nextNode())) { if (/\S/.test(n.nodeValue)) { first = n; break; } }
        if (!first) return;
        var idx = first.nodeValue.search(/\S/); rg.setStart(first, idx); rg.setEnd(first, idx + 1);
        var q = rg.getClientRects()[0], r = li.getBoundingClientRect(); if (q && (!cr || (q.top + 6 >= cr.top && q.top + 6 <= cr.bottom))) text(markerOf(li), r.left, q.top, getComputedStyle(li));
      });
      Array.prototype.forEach.call(root.querySelectorAll('img'), function (im) {  /* pictures */
        var r = im.getBoundingClientRect(); if (!r.width || !im.naturalWidth || (cr && (r.bottom < cr.top || r.top > cr.bottom))) return;
        var n = reg(im); used[n] = 1;
        out += 'q ' + (r.width * k).toFixed(2) + ' 0 0 ' + (r.height * k).toFixed(2) + ' ' + X(r.left) + ' ' + Y(r.bottom) + ' cm /Im' + n + ' Do Q\n';
      });
    }
    var hd = pg.querySelector('.hdw'), cl = pg.querySelector('.clip'), ft = pg.querySelector('.ftw');
    if (hd) paint(hd);
    if (cl) {
      var c = cl.getBoundingClientRect(), cr = { top: c.top + 1.3, bottom: c.bottom };   /* start 1.3px lower so no descender of the previous page's last line peeks in */
      out += 'q ' + X(c.left) + ' ' + Y(cr.bottom) + ' ' + ((c.right - c.left) * k).toFixed(2) + ' ' + ((cr.bottom - cr.top) * k).toFixed(2) + ' re W n\n'; paint(cl, cr); out += 'Q\n';
    }
    if (ft) paint(ft);
    return { c: out, im: Object.keys(used).map(Number) };
  }
  function makePdf() {
    var refs = PNP.app.refs, m = PNP.app.getMemo(), P = PNP.PAPERS[m.paperSize] || PNP.PAPERS.a4;
    return PNP.doc.imagesReady(refs).then(function () {
      var z0 = refs.sheet.style.zoom; refs.sheet.style.zoom = '1'; document.body.classList.add('pdfBusy');   /* phone Edit view keeps the pages off-screen: make them readable while the PDF is made */
      try {
        var imgs = [], seen = {}, W = toPt(P.w), H = toPt(P.h);
        function reg(im) {
          if (seen[im.src] != null) return seen[im.src];
          var sc = Math.min(1, 1600 / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement('canvas'), g;
          c.width = Math.max(1, Math.round(im.naturalWidth * sc)); c.height = Math.max(1, Math.round(im.naturalHeight * sc));
          g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
          var b = atob(c.toDataURL('image/jpeg', 0.92).split(',')[1]), u = new Uint8Array(b.length);
          for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
          imgs.push({ w: c.width, h: c.height, bytes: u }); return (seen[im.src] = imgs.length - 1);
        }
        var pages = Array.prototype.map.call(refs.pages.querySelectorAll('.pg'), function (pg) { var r = pdfPage(pg, W, H, reg); return { w: W, h: H, c: r.c, im: r.im }; });
        return pdfBuild(pages, imgs, PNP.fileBase(m));
      } finally { refs.sheet.style.zoom = z0; document.body.classList.remove('pdfBusy'); }
    });
  }
  function saveBlob(blob, name) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 30000); PNP.toast('PDF saved as ' + name, 6000);
  }
  function clientPdf() {
    PNP.toast('Creating PDF\u2026', 20000);
    return makePdf().then(function (blob) {
      var name = PNP.fileBase(PNP.app.getMemo()) + '.pdf', file = null;
      try { file = new File([blob], name, { type: 'application/pdf' }); } catch (e) {}
      var phone = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform));
      if (phone && file && navigator.canShare && navigator.canShare({ files: [file] })) {   /* phone share sheet: Save to Files / Drive / WhatsApp... */
        return navigator.share({ files: [file], title: name }).then(function () { PNP.toast('PDF ready.'); }, function (e) { if (!e || e.name !== 'AbortError') saveBlob(blob, name); });
      }
      saveBlob(blob, name);
    }).catch(function (e) { PNP.toast('Could not create the PDF (' + (e && e.message || e) + '). Use Print and choose Save as PDF.', 8000); print(); });
  }
  var installEvt = null;
  function pwaInit() {
    var standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone;
    if (standalone) $('a2hsBtn').hidden = true;
    window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); installEvt = e; $('a2hsInstall').hidden = false; });
    window.addEventListener('appinstalled', function () { $('a2hsBtn').hidden = true; if ($('a2hsDlg').open) $('a2hsDlg').close(); PNP.toast('Installed. Open it from your home screen.'); });
    $('a2hsBtn').addEventListener('click', function () { $('a2hsDlg').showModal(); });
    $('a2hsClose').addEventListener('click', function () { $('a2hsDlg').close(); });
    $('a2hsInstall').addEventListener('click', function () {
      if (!installEvt) return; installEvt.prompt(); installEvt.userChoice.then(function () { installEvt = null; $('a2hsInstall').hidden = true; $('a2hsDlg').close(); });
    });
    /* The manifest (manifest.webmanifest) is linked in index.html. The service worker makes the app installable and usable offline. */
    if (/^https?:$/.test(location.protocol)) {
      if (document.querySelector('link[rel="manifest"]')) { if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {}); }
      else {   /* single-file copy: no manifest file next to it, so build one on the fly */
        try {
          var i192 = document.querySelector('link[rel="apple-touch-icon"]').href, i512 = (PNP.ASSETS && PNP.ASSETS.icon512) || new URL('assets/icon-512.png', location.href).href;
          var man = { name: 'PNP Memorandum Generator', short_name: 'PNP Memo', description: 'Create and print PNP memorandums', start_url: location.href.split('#')[0], scope: new URL('./', location.href).href, display: 'standalone', background_color: '#1e3a8a', theme_color: '#1e3a8a',
            icons: [{ src: i192, sizes: '192x192', type: 'image/png', purpose: 'any' }, { src: i512, sizes: '512x512', type: 'image/png', purpose: 'any' }, { src: i512, sizes: '512x512', type: 'image/png', purpose: 'maskable' }] };
          var l = document.createElement('link'); l.rel = 'manifest'; l.href = URL.createObjectURL(new Blob([JSON.stringify(man)], { type: 'application/manifest+json' })); document.head.appendChild(l);
        } catch (e) {}
      }
    }
  }

  function copyText(t) {
    function fallback() { var a = document.createElement('textarea'); a.value = t; a.style.position = 'fixed'; a.style.opacity = '0'; document.body.appendChild(a); a.select(); var ok = false; try { ok = document.execCommand('copy'); } catch (e) {} a.remove(); return ok; }
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(t).then(function () { return true; }, function () { return fallback(); });
    return Promise.resolve(fallback());
  }
  function isPhone() { return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform)); }
  function aiWording() {
    var ph = isPhone();
    $('aiStepGo').innerHTML = ph ? 'Tap <b>Copy &amp; open ChatGPT</b>. Your request and your text are copied, and ChatGPT opens (in the ChatGPT app if you have it, otherwise in your browser).'
      : 'Click <b>Copy &amp; open ChatGPT</b>. Your request and your text are copied, and chatgpt.com opens in a new tab.';
    $('aiStepPaste').innerHTML = ph ? 'In ChatGPT, <b>tap and hold</b> the message box, tap <b>Paste</b>, then tap the send button.'
      : 'In ChatGPT, click the message box, press <b>Ctrl+V</b> (Cmd+V on Mac), then Enter.';
    $('aiStepBack').innerHTML = ph ? 'Tap the <b>copy</b> icon under ChatGPT&rsquo;s answer, switch back to this app, then <b>tap and hold</b> in the body text box and tap <b>Paste</b>.'
      : 'Copy ChatGPT&rsquo;s answer, come back here and paste it into the body text box.';
  }
  function aiHelp(copy) {
    var w = window.open('https://chatgpt.com/', '_blank'); if (w) { try { w.opener = null; } catch (e) {} }   /* opened first so the browser allows it */
    if (!copy) return;
    var body = PNP.plain(PNP.joinSections(PNP.app.getMemo().sections)).trim();
    copyText($('aiTask').value + (body ? '\n\n---\n' + body : '\n\n---\n(paste your text here)')).then(function (ok) {
      PNP.toast(ok ? (isPhone() ? 'Copied. In ChatGPT, tap and hold the message box, then tap Paste.' : 'Copied. In ChatGPT press Ctrl+V, then Enter.') : 'Could not copy automatically. Select your text and copy it yourself.', 7000);
      if (!w) PNP.toast('Your browser blocked the new tab. Allow pop-ups, or open chatgpt.com yourself and paste.', 8000);
    });
  }
  function init(cfg) {
    pdfAvailable = !!cfg.pdf;
    pwaInit();
    $('aiBtn').addEventListener('click', function () { aiWording(); $('aiDlg').showModal(); });
    $('aiClose').addEventListener('click', function () { $('aiDlg').close(); });
    $('aiGo').addEventListener('click', function () { aiHelp(true); });
    $('aiOpen').addEventListener('click', function () { aiHelp(false); });
    $('newBtn').addEventListener('click', newMemo);
    $('pdfBtn').addEventListener('click', download);
    $('printBtn').addEventListener('click', print);
  }
  PNP.store = { init: init };
})();
