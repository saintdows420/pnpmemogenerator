/* The memorandum document: paper sizes, classification, header/footer, signatory.
   build() creates the sheet once; update() pushes a memo into it. Used by the live preview AND print.html. */
(function () {
  'use strict';
  var PNP = window.PNP;

  PNP.PAPERS = {
    a4:     { label: 'A4 (210 \u00d7 297 mm)',         w: '210mm', h: '297mm', px: 793.7 },
  };
  PNP.CLASSES = { CONFIDENTIAL: 'CONFIDENTIAL', RESTRICTED: 'RESTRICTED', NONE: '' };

  /* Letterhead lines [text, bold]. Plain lines are 10 pt, bold lines 11 pt (as in the template). Edit here to change the unit header. */
  PNP.UNIT_HEADER = [
    ['Republic of the Philippines', 0],
    ['NATIONAL POLICE COMMISSION', 0],
    ['PHILIPPINE NATIONAL POLICE, POLICE REGIONAL OFFICE 4A', 1],
    ['LAGUNA PROVINCIAL OFFICE', 1],
    ['SANTA ROSA COMPONENT CITY POLICE STATION', 1],
    ['Brgy Tagapo, Santa Rosa City, Laguna', 0],
  ];
  PNP.TAGLINE = '\u201cSa Bagong Pilipinas, Ang Gusto ng Pulis, Ligtas Ka!\u201d';
  PNP.SECURITY_ADVICE = "SECURITY ADVICE: This document and all information stated herein are intended for the recipient's official internal use only and should not be disclosed to any other agency or third party without the written consent of the CPNP.";

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function img(cls, src) { var i = el('img', cls); i.src = src; i.alt = ''; return i; }
  function row(key, valueEl, extra) {
    var r = el('div', 'row'); r.appendChild(el('span', 'k', key));
    var v = el('span', 'v' + (extra || '')), vv = el('div', 'vv'); v.appendChild(el('span', 'c', ':')); vv.appendChild(valueEl); v.appendChild(vv); r.appendChild(v); return r;
  }

  /* Signatory placement. Called whenever the body HTML changes.
     - trailing blank lines are dropped, so the gap is always exactly four lines (CSS margin on .sigblock)
     - the last paragraph and the signatory share a no-split wrapper, so the signatory can never be
       stranded alone on a new page: if they do not fit together, the last paragraph moves with it. */
  function isBlank(n) {
    if (n.nodeType === 3) return !/[^\s\u00a0]/.test(n.nodeValue);
    if (n.nodeType !== 1) return true;
    if (n.tagName === 'BR') return true;
    return /^(DIV|P)$/.test(n.tagName) && !n.querySelector('img,table,li') && !/[^\s\u00a0]/.test(n.textContent);
  }
  function arrangeTail(refs) {
    var body = refs.body, last;
    while ((last = body.lastChild) && isBlank(last)) body.removeChild(last);
    var blk = null;
    if (last && last.nodeType === 1 && /^(DIV|P)$/.test(last.tagName)) blk = last;
    else if (last && (last.nodeType === 3 || /^(B|STRONG|I|EM|U|SPAN)$/.test(last.tagName))) {
      var nodes = [], n = last;
      while (n && !(n.nodeType === 1 && /^(BR|DIV|P|UL|OL|TABLE)$/.test(n.tagName))) { nodes.unshift(n); n = n.previousSibling; }
      blk = document.createElement('div'); nodes.forEach(function (x) { blk.appendChild(x); }); body.appendChild(blk);
    }
    var keep = el('div', 'keep');
    if (blk) body.insertBefore(keep, blk), keep.appendChild(blk); else body.appendChild(keep);
    keep.appendChild(refs.sig);
  }

  /* Where each page starts. units = [top,bottom] of every line / image / table row / kept block in the flow (px).
     A page ends at the last unit that fits; the next page begins at the first unit that does not. */
  function breaks(units, total, bodyH) {
    var starts = [0], start = 0, i, guard = 0;
    units.sort(function (a, b) { return a[0] - b[0]; });
    while (total > start + bodyH + 0.5 && guard++ < 500) {
      var limit = start + bodyH, next = limit;
      for (i = 0; i < units.length; i++) if (units[i][1] > limit + 0.5) { if (units[i][0] > start + 1) next = units[i][0]; break; }
      starts.push(next); start = next;
    }
    return starts;
  }
  function paginate(refs) {
    refs.raf = 0;
    var win = refs.probe.querySelector('.win'), cs = getComputedStyle(win), fl = refs.flow;
    var bodyH = win.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    if (!(bodyH > 50)) return;
    var top0 = fl.getBoundingClientRect().top, units = [];
    function add(q) { if (q.height > 1) units.push([q.top - top0, q.bottom - top0]); }
    function walk(n) {
      if (n.nodeType === 3) {
        if (/\S/.test(n.nodeValue)) { var r = document.createRange(); r.selectNodeContents(n); var lh = parseFloat(getComputedStyle(n.parentNode).lineHeight);
          Array.prototype.forEach.call(r.getClientRects(), function (q) {
            var ex = lh > q.height ? (lh - q.height) / 2 : 0;   /* use the whole line box so a cut never crosses letters */
            if (q.height > 1) units.push([q.top - ex - top0, q.bottom + ex - top0]);
          }); }
        return;
      }
      if (n.nodeType !== 1) return;
      var t = n.tagName, q = n.getBoundingClientRect();
      if (t === 'IMG') { var oy = parseFloat(n.getAttribute('data-y')) || 0; add({ top: q.top - oy, bottom: q.bottom - oy, height: q.height }); return; }
      if (t === 'TR' || (n.classList.contains('keep') && q.height <= bodyH)) { add(q); return; }
      if (!n.firstChild || (/^(DIV|P|LI)$/.test(t) && !/\S/.test(n.textContent) && !n.querySelector('img,table'))) { add(q); return; }
      Array.prototype.forEach.call(n.childNodes, walk);
    }
    walk(fl);
    var starts = breaks(units, fl.getBoundingClientRect().height, bodyH);
    refs.pages.textContent = '';
    starts.forEach(function (st, i) {
      var card = el('div', 'pg'), w = el('div', 'win'), clip = el('div', 'clip'), c = fl.cloneNode(true);
      clip.style.height = (i + 1 < starts.length ? Math.min(bodyH, starts[i + 1] - st) : bodyH) + 'px';
      c.style.top = -st + 'px'; clip.appendChild(c); w.appendChild(clip);
      card.appendChild(refs.hdTpl.cloneNode(true)); card.appendChild(w); card.appendChild(refs.ftTpl.cloneNode(true));
      refs.pages.appendChild(card);
    });
    refs.count = starts.length;
    Array.prototype.forEach.call(refs.meas.querySelectorAll('img'), function (im) {   /* late-loading pictures change line positions */
      if (!im.complete && !im._w) { im._w = 1; im.addEventListener('load', function () { schedule(refs); }); }
    });
  }
  function schedule(refs) { if (refs.raf) cancelAnimationFrame(refs.raf); refs.raf = requestAnimationFrame(function () { paginate(refs); }); }
  function waitImgs(root) {
    return Promise.all(Array.prototype.map.call(root.querySelectorAll('img'), function (i) {
      return i.complete ? Promise.resolve() : new Promise(function (r) { i.onload = i.onerror = r; });
    }));
  }

  PNP.doc = {
    _breaks: breaks,
    build: function (host) {
      host.textContent = '';
      var sheet = el('div', 'sheet'), refs = { sheet: sheet, meas: el('div', 'sheet meas'), pages: el('div', 'pages'), raf: 0 };

      var hd = el('div', 'hd'); hd.appendChild(el('div', 'hsp'));   /* two empty lines, as in the template */
      PNP.UNIT_HEADER.forEach(function (h) { hd.appendChild(el('p', h[1] ? 'bold' : 'sm', h[0])); });
      hd.appendChild(el('div', 'hend'));
      refs.hdTpl = el('div', 'hdw'); refs.hdTpl.appendChild(hd);
      refs.hdTpl.appendChild(img('l', PNP.ASSETS.logoLeft)); refs.hdTpl.appendChild(img('r', PNP.ASSETS.logoRight));   /* placed on the page, like the template */

      var ft = el('div', 'ft'); ft.appendChild(img('seal', PNP.ASSETS.seal));
      ft.appendChild(el('div', 'tag', PNP.TAGLINE)); refs.clsBot = el('div', 'cls'); ft.appendChild(refs.clsBot);   /* classification: footer only */
      refs.adv = el('div', 'adv', PNP.SECURITY_ADVICE); ft.appendChild(refs.adv);
      refs.ftTpl = el('div', 'ftw'); refs.ftTpl.appendChild(ft);

      var fl = el('div', 'flow'); refs.flow = fl;
      fl.appendChild(el('p', 't', 'MEMORANDUM'));
      refs.to = el('span'); refs.attn = el('div', 'attn'); refs.from = el('span'); refs.subject = el('span', 'b'); refs.date = el('span');
      var forRow = row('FOR', refs.to); refs.forK = forRow.querySelector('.k'); forRow.querySelector('.vv').appendChild(refs.attn);
      fl.appendChild(forRow); fl.appendChild(row('FROM', refs.from)); fl.appendChild(row('SUBJECT', refs.subject)); fl.appendChild(row('DATE', refs.date));
      fl.appendChild(el('div', 'rule'));
      refs.body = el('div', 'body');
      refs.sig = el('div', 'sigblock'); refs.sigName = el('b'); refs.sigRank = el('span');
      refs.sig.appendChild(refs.sigName); refs.sig.appendChild(refs.sigRank);
      fl.appendChild(refs.body);   /* the signatory lives at the end of .body (see arrangeTail) */

      refs.probe = el('div', 'pg'); var pw = el('div', 'win');   /* empty page: its window height is the room for text */
      refs.probe.appendChild(refs.hdTpl.cloneNode(true)); refs.probe.appendChild(pw); refs.probe.appendChild(refs.ftTpl.cloneNode(true));
      refs.meas.appendChild(fl); refs.meas.appendChild(refs.probe);
      sheet.appendChild(refs.pages); host.appendChild(sheet); host.appendChild(refs.meas);
      refs._body = null;
      refs.flush = function () { if (refs.raf) cancelAnimationFrame(refs.raf); paginate(refs); };
      return refs;
    },

    /* Push a memo ({to, attn, from, subject, date, sections, signatoryName, signatoryRank, paperSize, classification}) into the document. */
    update: function (refs, m) {
      var p = PNP.PAPERS[m.paperSize] || PNP.PAPERS.a4;
      [refs.sheet, refs.meas].forEach(function (x) { x.style.setProperty('--pw', p.w); x.style.setProperty('--ph', p.h); });
      var cls = PNP.CLASSES[m.classification] != null ? PNP.CLASSES[m.classification] : PNP.CLASSES.CONFIDENTIAL;
      refs.clsBot.textContent = cls || '\u00a0';
      refs.to.textContent = m.to || ''; refs.attn.textContent = (m.attn || '').trim(); refs.from.textContent = m.from || ''; refs.forK.textContent = m.forLabel === 'TO' ? 'TO' : 'FOR';
      refs.subject.textContent = m.subject || ''; refs.date.textContent = PNP.fmtDate(m.date);
      var html = PNP.joinSections(m.sections);
      if (html !== refs._body) { refs.body.innerHTML = html; refs._body = html; arrangeTail(refs); }
      refs.sigName.textContent = (m.signatoryName || '').toUpperCase();   /* capitals in the text itself, so the PDF matches */ refs.sigRank.textContent = m.signatoryRank || '';
      refs.sig.hidden = !(m.signatoryName || m.signatoryRank);
      schedule(refs);
    },

    /* @page must match the selected paper; Chrome/Firefox/Safari honour it for printing and "Save as PDF". */
    pageRule: function (key) { var p = PNP.PAPERS[key] || PNP.PAPERS.a4; return '@page{size:' + p.w + ' ' + p.h + ';margin:0}'; },

    /* Shrink the on-screen sheet to the pane width (screen only; print forces zoom:1). */
    fit: function (refs, pane, key) {
      var p = PNP.PAPERS[key] || PNP.PAPERS.a4;
      if (pane.clientWidth < 60) return;   /* pane hidden (phone Edit view): keep the last scale */
      refs.sheet.style.zoom = Math.min(1, (pane.clientWidth - 2) / p.px) || 1;
    },

    /* Resolve once every image in the sheet has loaded (used before printing). */
    imagesReady: function (refs) {
      refs.flush();
      return waitImgs(refs.meas).then(function () { refs.flush(); return waitImgs(refs.sheet); });
    },
  };
})();
