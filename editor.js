/* Rich-text body editor: sections, ribbon commands, tables, body-text templates, selection tracking. */
(function () {
  'use strict';
  var PNP = window.PNP, $ = PNP.$;
  var lastRange = null, activeEd = null, onChange = function () {};

  var OPTS = [['memo', 'Reference / Purpose / Instructions'], ['info', 'For information and reference'], ['approval', 'Request for approval'], ['report', 'Submission of report'], ['comply', 'For strict compliance']];
  var BODYOPT = {
    memo: '<div>1. REFERENCE: [Cite reference document].</div><div><br></div><div>2. PURPOSE: This memorandum is to [state the purpose].</div><div><br></div><div>3. INSTRUCTIONS: [State instructions to concerned units/personnel].</div><div><br></div><div>4. For information and strict compliance.</div>',
    info: '<div>This is to respectfully submit for your information and reference the [subject/document] as of [date].</div>',
    approval: '<div>This pertains to the request for approval of [subject/activity] scheduled on [date] at [venue].</div><div><br></div><div>Respectfully forwarded for your consideration and approval.</div>',
    report: '<div>Submitted herewith is the [name of report] for the period [date] for your information and appropriate action.</div>',
    comply: '<div>For strict compliance and immediate dissemination to all concerned.</div>',
  };

  function eds() { return Array.prototype.slice.call(document.querySelectorAll('.bodyEd')); }
  function liveEd() { return (activeEd && document.body.contains(activeEd)) ? activeEd : eds()[0]; }

  document.addEventListener('selectionchange', function () {
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    eds().forEach(function (ed) { if (ed.contains(sel.anchorNode)) { activeEd = ed; lastRange = sel.getRangeAt(0).cloneRange(); } });
  });

  function restoreSel(range) {
    var ed = liveEd(), sel = window.getSelection(), r = range || lastRange;
    ed.focus();
    if (r && ed.contains(r.startContainer)) { sel.removeAllRanges(); sel.addRange(r); }
    else { var rg = document.createRange(); rg.selectNodeContents(ed); rg.collapse(false); sel.removeAllRanges(); sel.addRange(rg); }
  }
  function getSections() { return eds().map(function (e) { return PNP.clean(e.innerHTML); }); }
  function afterEdit() { onChange(getSections()); if (PNP.images) PNP.images.refresh(); }

  function pd(e) { e.preventDefault(); }

  function makeSec(html) {
    var d = document.createElement('div'); d.className = 'bsec';
    d.innerHTML = '<label class="bl">BODY TEXT</label><div class="bodyEd" contenteditable="true" spellcheck="true" role="textbox" aria-multiline="true"></div>' +
      '<div class="secbar"><select class="optSel" aria-label="Body text template">' + OPTS.map(function (o) { return '<option value="' + o[0] + '">' + o[1] + '</option>'; }).join('') +
      '</select><button type="button" class="sec optBtn">Insert Body Text</button><button type="button" class="ghost rmBtn">Remove</button></div>';
    var ed = d.querySelector('.bodyEd'); ed.innerHTML = html;
    ed.addEventListener('input', afterEdit);
    ed.addEventListener('paste', function (e) {   /* plain text only: keeps pasted content free of foreign styles */
      var cf = e.clipboardData && e.clipboardData.files && e.clipboardData.files[0];
      if (cf && /^image\//.test(cf.type)) { e.preventDefault(); activeEd = ed; insertDoc(cf); return; }
      e.preventDefault();
      document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain'));
    });
    ed.addEventListener('dragover', function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') > -1) e.preventDefault(); });
    ed.addEventListener('drop', function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (!f) return;
      e.preventDefault(); activeEd = ed; lastRange = null;
      insertDoc(f);
    });
    var ob = d.querySelector('.optBtn');
    ob.addEventListener('mousedown', pd);
    ob.addEventListener('click', function () {
      activeEd = ed; if (lastRange && !ed.contains(lastRange.startContainer)) lastRange = null;
      restoreSel();
      var has = ed.textContent.trim() !== '';
      document.execCommand('insertHTML', false, (has ? '<div><br></div>' : '') + (BODYOPT[d.querySelector('.optSel').value] || ''));
      afterEdit();
    });
    d.querySelector('.rmBtn').addEventListener('click', function () {
      if (eds().length < 2) return;
      d.parentNode.removeChild(d); lastRange = null; activeEd = null; relabel(); afterEdit();
    });
    return d;
  }
  function relabel() {
    var l = document.querySelectorAll('.bsec'), n = l.length;
    Array.prototype.forEach.call(l, function (d, i) {
      d.querySelector('.bl').textContent = n > 1 ? 'BODY TEXT ' + (i + 1) : 'BODY TEXT';
      d.querySelector('.rmBtn').style.display = n > 1 ? '' : 'none';
    });
  }
  function setSections(arr) {
    var box = $('secs'); box.textContent = '';
    (arr && arr.length ? arr : ['']).slice(0, 20).forEach(function (h) { box.appendChild(makeSec(PNP.toHtml(h))); });
    lastRange = null; activeEd = null; relabel();
    if (PNP.images) PNP.images.refresh();
  }

  /* ---- ribbon ---- */
  function cmd(c, v) {
    if ((c === 'indent' || c === 'outdent') && !curList()) { blockIndent(c === 'indent' ? 1 : -1); return; }
    restoreSel(); document.execCommand('styleWithCSS', false, true); document.execCommand(c, false, v == null ? null : v); afterEdit();
  }
  function setSize(pt) {
    restoreSel(); document.execCommand('styleWithCSS', false, true); document.execCommand('fontSize', false, '7');
    var ed = liveEd();
    Array.prototype.slice.call(ed.querySelectorAll('font[size="7"],span[style*="xxx-large"]')).forEach(function (el) {
      if (el.tagName === 'FONT') {
        var sp = document.createElement('span'); sp.style.fontSize = pt + 'pt';
        while (el.firstChild) sp.appendChild(el.firstChild);
        el.parentNode.replaceChild(sp, el);
      } else el.style.fontSize = pt + 'pt';
    });
    afterEdit();
  }
  function curList() {
    var ed = liveEd(), sel = window.getSelection(), n = null;
    if (sel && sel.rangeCount && ed.contains(sel.anchorNode)) n = sel.anchorNode; else if (lastRange) n = lastRange.startContainer;
    while (n && n !== ed) { if (n.nodeType === 1 && /^(UL|OL)$/.test(n.tagName)) return n; n = n.parentNode; }
    return null;
  }
  function ex(c) { document.execCommand('styleWithCSS', false, true); document.execCommand(c, false, null); }
  function blockIndent(d) {
    restoreSel(); var ed = liveEd();
    document.execCommand('formatBlock', false, 'div');   /* bare lines become blocks so each can carry its own indent */
    var sel = window.getSelection(), r = sel && sel.rangeCount ? sel.getRangeAt(0) : null, hit = 0;
    Array.prototype.forEach.call(ed.querySelectorAll('div,p'), function (b) {
      if (r && r.intersectsNode(b) && !b.querySelector('div,p,li,ul,ol') && !b.closest('li')) {
        var l = Math.max(0, Math.min(6, (parseInt(b.getAttribute('data-ind'), 10) || 0) + d));
        if (l) b.setAttribute('data-ind', l); else b.removeAttribute('data-ind'); hit++;
      }
    });
    if (hit) afterEdit(); else PNP.toast('Click inside the text first.');
  }
  function listStyle(k) {
    restoreSel(); var cur = curList();
    if (k === 'none') { if (cur) ex(cur.tagName === 'OL' ? 'insertOrderedList' : 'insertUnorderedList'); }
    else if (k === 'bullet') { if (!cur || cur.tagName === 'OL') ex('insertUnorderedList'); }
    else { if (!cur || cur.tagName === 'UL') ex('insertOrderedList'); var l = curList(); if (l && l.tagName === 'OL') l.setAttribute('type', k); }
    afterEdit();
  }
  function lineSpacing(v) {
    restoreSel(); var ed = liveEd(), sel = window.getSelection(), r = sel && sel.rangeCount ? sel.getRangeAt(0) : null, hit = 0;
    Array.prototype.forEach.call(ed.querySelectorAll('div,p,li'), function (b) { if (r && r.intersectsNode(b) && !b.querySelector('div,p,li')) { b.style.lineHeight = v; hit++; } });
    if (!hit) PNP.toast('Click inside the text first'); else afterEdit();
  }
  /* ---- Insert File: .docx / .txt / .md / .csv / .html text goes in at the cursor; images go to the picture tool ---- */
  function docxXml(buf) {
    var v = new DataView(buf), u = new Uint8Array(buf), i = u.length - 22;
    while (i >= 0 && v.getUint32(i, true) !== 0x06054b50) i--;
    if (i < 0) throw new Error('Not a valid .docx file.');
    var n = v.getUint16(i + 10, true), p = v.getUint32(i + 16, true), dec = function (b) { return new TextDecoder().decode(b); };
    for (var k = 0; k < n; k++) {
      var m = v.getUint16(p + 10, true), cs = v.getUint32(p + 20, true), nl = v.getUint16(p + 28, true), xl = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true), off = v.getUint32(p + 42, true);
      if (dec(u.subarray(p + 46, p + 46 + nl)) === 'word/document.xml') {
        var st = off + 30 + v.getUint16(off + 26, true) + v.getUint16(off + 28, true), data = u.subarray(st, st + cs);
        if (m === 0) return Promise.resolve(dec(data));
        return new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer().then(dec);
      }
      p += 46 + nl + xl + cl;
    }
    throw new Error('No text found in this .docx file.');
  }
  function docxText(xml) {
    var un = function (t) { return t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&'); };
    return xml.replace(/<w:p\s*\/>/g, '<w:p></w:p>').split('</w:p>').map(function (par) {
      var re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\s*\/>|<w:br\s*\/?>/g, m, out = '';
      while ((m = re.exec(par))) out += m[1] != null ? un(m[1]) : (m[0].indexOf('tab') > -1 ? '    ' : '\n');
      return out;
    }).join('\n').replace(/\s+$/, '');
  }
  function insertDoc(f) {
    if (/^image\//.test(f.type)) { if (PNP.images) PNP.images.insertFile(f); return; }
    var n = f.name.toLowerCase(), p;
    if (f.size > 3e6) { PNP.toast('File is too large (max 3 MB).'); return; }
    if (/\.docx$/.test(n)) p = f.arrayBuffer().then(docxXml).then(function (x) { return PNP.textToHtml(docxText(x)); });
    else if (/\.html?$/.test(n)) p = f.text().then(function (t) { return PNP.clean(t.replace(/<head[\s\S]*?<\/head>/i, '')); });
    else if (/\.(txt|md|csv)$/.test(n) || /^text\//.test(f.type)) p = f.text().then(PNP.textToHtml);
    else { PNP.toast(/\.doc$/.test(n) ? 'Old .doc files are not supported. Save it as .docx first.' : 'Unsupported file. Use .docx, .txt, .md, .csv, .html or an image.', 6000); return; }
    p.then(function (h) { restoreSel(); document.execCommand('insertHTML', false, h); afterEdit(); PNP.toast('File inserted.'); })
      .catch(function (e) { PNP.toast(e.message || 'Could not read this file.', 6000); });
  }
  function setRibbon(hide, keep) {   /* arrow button: hide / show the ribbon (tabs stay) */
    var rb = document.querySelector('.ribbon'), b = $('ribToggle');
    rb.classList.toggle('collapsed', hide); b.innerHTML = hide ? '&#9660;' : '&#9650;';
    b.title = hide ? 'Show the ribbon' : 'Hide the ribbon'; b.setAttribute('aria-expanded', hide ? 'false' : 'true'); if (!keep) PNP.pref.set('ribbonHidden', hide ? '1' : '0');
  }
  function showTab(name) {
    if (document.querySelector('.ribbon.collapsed')) setRibbon(false);
    Array.prototype.forEach.call(document.querySelectorAll('.rt'), function (x) { x.classList.toggle('on', x.dataset.tab === name); });
    Array.prototype.forEach.call(document.querySelectorAll('.rpanel'), function (pn) { pn.hidden = pn.id !== 'tab-' + name; });
  }

  function curCell() {
    var ed = liveEd(), sel = window.getSelection(), n = null;
    if (sel && sel.rangeCount && ed.contains(sel.anchorNode)) n = sel.anchorNode; else if (lastRange) n = lastRange.startContainer;
    while (n && n !== ed) { if (n.nodeType === 1 && (n.tagName === 'TD' || n.tagName === 'TH')) return n; n = n.parentNode; }
    return null;
  }
  function newTd() { var td = document.createElement('td'); td.innerHTML = '<br>'; return td; }
  /* ---- table column widths: every table carries a <colgroup>; the widths are percentages that always add up to 100 ---- */
  function setW(c, w) { c.setAttribute('data-w', w.toFixed(2)); c.style.width = w.toFixed(2) + '%'; }
  function colsOf(table) {
    var n = table.rows.length ? table.rows[0].cells.length : 0, cg = table.querySelector('colgroup');
    if (!cg) { cg = document.createElement('colgroup'); table.insertBefore(cg, table.firstChild); }
    while (cg.children.length < n) cg.appendChild(document.createElement('col'));
    while (cg.children.length > n) cg.removeChild(cg.lastChild);
    var cols = Array.prototype.slice.call(cg.children), sum = 0, bad = false;
    cols.forEach(function (c) { var w = parseFloat(c.getAttribute('data-w')); if (!(w > 0)) bad = true; else sum += w; });
    if (bad || !sum) cols.forEach(function (c) { setW(c, 100 / n); });
    else if (Math.abs(sum - 100) > 0.5) cols.forEach(function (c) { setW(c, parseFloat(c.getAttribute('data-w')) * 100 / sum); });
    return cols;
  }
  function tblOp(k) {
    var cell = curCell();
    if (!cell) { PNP.toast('Click inside a table cell first'); return; }
    var tr = cell.parentNode, table = cell.closest('table'), idx = cell.cellIndex;
    if (k === 'addRow') { var nr = document.createElement('tr'); for (var i = 0; i < tr.cells.length; i++) nr.appendChild(newTd()); tr.parentNode.insertBefore(nr, tr.nextSibling); }
    else if (k === 'addCol') {
      var cols = colsOf(table), half = parseFloat(cols[idx].getAttribute('data-w')) / 2, nc = document.createElement('col');   /* the new column takes half of the one beside it */
      Array.prototype.forEach.call(table.rows, function (rw) { rw.insertBefore(newTd(), rw.cells[idx + 1] || null); });
      setW(cols[idx], half); setW(nc, half); cols[idx].parentNode.insertBefore(nc, cols[idx].nextSibling);
    }
    else if (k === 'eqCols') { var all = colsOf(table); all.forEach(function (c) { setW(c, 100 / all.length); }); }
    else if (k === 'delRow') { tr.parentNode.removeChild(tr); if (!table.rows.length) table.remove(); }
    else if (k === 'delCol') {
      var dc = colsOf(table), gone = parseFloat(dc[idx].getAttribute('data-w')), nb = dc[idx - 1] || dc[idx + 1];   /* its width goes to the neighbour */
      if (nb) setW(nb, parseFloat(nb.getAttribute('data-w')) + gone); dc[idx].parentNode.removeChild(dc[idx]);
      Array.prototype.forEach.call(table.rows, function (rw) { if (rw.cells[idx]) rw.removeChild(rw.cells[idx]); }); if (!table.rows[0] || !table.rows[0].cells.length) table.remove(); }
    else if (k === 'delTable') table.remove();
    afterEdit();
  }

  function init(cb) {
    onChange = cb;
    var sz = $('fSize'); for (var i = 1; i <= 100; i++) { var o = document.createElement('option'); o.textContent = i; if (i === 11) o.selected = true; sz.appendChild(o); }
    $('addSec').addEventListener('click', function () {
      var d = makeSec(''); $('secs').appendChild(d); relabel(); afterEdit();
      var e = d.querySelector('.bodyEd'); activeEd = e; lastRange = null; e.focus();
    });
    Array.prototype.forEach.call(document.querySelectorAll('.ribbon [data-c]'), function (b) {
      b.addEventListener('mousedown', pd); b.addEventListener('click', function () { cmd(b.dataset.c); });
    });
    $('fFont').addEventListener('change', function () { cmd('fontName', $('fFont').value); });
    $('fSize').addEventListener('change', function () { setSize($('fSize').value); });
    /* font colour and highlight, like Word: left part applies the current colour, the arrow opens the colour menu */
    var curFore = '#000000', curHi = '#ffff00';
    function setFore(c) { curFore = c; $('fColorBar').style.background = c; cmd('foreColor', c); }
    function setHi(c) { if (c !== 'transparent') { curHi = c; $('fHiBar').style.background = c; } cmd('hiliteColor', c); }
    ['fColorBtn', 'fColorArr', 'fHiBtn', 'fHiArr'].forEach(function (id) { $(id).addEventListener('mousedown', pd); });
    $('fColorBtn').addEventListener('click', function () { setFore(curFore); });
    $('fHiBtn').addEventListener('click', function () { setHi(curHi); });
    $('fColorArr').addEventListener('click', function () { PNP.colorMenu.open($('fColorBtn'), { current: curFore, none: { label: 'Automatic', value: '#000000', chip: '#000000' }, onPick: setFore, more: function () { $('fColor').click(); } }); });
    $('fHiArr').addEventListener('click', function () { PNP.colorMenu.open($('fHiBtn'), { current: curHi, none: { label: 'No Color', value: 'transparent' }, onPick: setHi, more: function () { $('fHi').click(); } }); });
    $('fColor').addEventListener('input', function () { setFore($('fColor').value); });
    $('fHi').addEventListener('input', function () { setHi($('fHi').value); });
    $('fileIns').addEventListener('mousedown', pd);
    $('fileIns').addEventListener('click', function () { $('docFile').value = ''; $('docFile').click(); });
    $('docFile').addEventListener('change', function () { if ($('docFile').files[0]) insertDoc($('docFile').files[0]); });
    $('ribToggle').addEventListener('click', function () { setRibbon(!document.querySelector('.ribbon.collapsed')); });
    var rh = PNP.pref.get('ribbonHidden');
    if (rh === '1') setRibbon(true); else if (rh === null && window.innerWidth <= 900) setRibbon(true, true);   /* phones: start collapsed to save screen space */
    $('fList').addEventListener('change', function () { var v = $('fList').value; $('fList').value = ''; if (v) listStyle(v); });
    $('fLine').addEventListener('change', function () { var v = $('fLine').value; $('fLine').value = ''; if (v) lineSpacing(v); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Tab' && activeEd && activeEd.contains(e.target)) { e.preventDefault(); cmd(e.shiftKey ? 'outdent' : 'indent'); }
    });
    Array.prototype.forEach.call(document.querySelectorAll('.rt'), function (b) {
      b.addEventListener('mousedown', pd); b.addEventListener('click', function () { showTab(b.dataset.tab); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('.ribbon [data-t]'), function (b) {
      b.addEventListener('mousedown', pd); b.addEventListener('click', function () { tblOp(b.dataset.t); });
    });
    /* drag a column border to resize, like Word / Google Docs. Handles sit over the borders of the table you are pointing at or typing in. */
    var hot = null, ov = document.createElement('div'), drag = null, lastType = 'mouse';
    ov.id = 'colHandles'; document.body.appendChild(ov);
    function caretTable() { var s = window.getSelection(), n = s && s.rangeCount ? s.anchorNode : null; if (n && n.nodeType !== 1) n = n.parentNode; return n && n.closest ? n.closest('.bodyEd table') : null; }
    function placeHandles() {
      var hs = ov.children, t = hot && hot.getBoundingClientRect();
      if (!hot || !document.body.contains(hot) || !hot.rows.length) { ov.textContent = ''; hot = null; return; }
      var cells = hot.rows[0].cells;
      if (hs.length !== cells.length - 1) { ov.textContent = ''; for (var i = 0; i < cells.length - 1; i++) { var h = document.createElement('div'); h.className = 'colH'; h.dataset.i = i; h.title = 'Drag to change the column width'; ov.appendChild(h); } }
      for (var j = 0; j < hs.length; j++) { var r = cells[j].getBoundingClientRect(); hs[j].style.left = (r.right - 7) + 'px'; hs[j].style.top = t.top + 'px'; hs[j].style.height = t.height + 'px'; }
    }
    ov.addEventListener('pointerdown', function (ev) {
      var h = ev.target.closest('.colH'); if (!h || !hot) return;
      var i = +h.dataset.i, cols = colsOf(hot);
      drag = { i: i, cols: cols, x0: ev.clientX, w0: parseFloat(cols[i].getAttribute('data-w')), w1: parseFloat(cols[i + 1].getAttribute('data-w')), tw: hot.getBoundingClientRect().width, h: h };
      try { h.setPointerCapture(ev.pointerId); } catch (x) {}
      h.classList.add('on'); ev.preventDefault();
    });
    ov.addEventListener('pointermove', function (ev) {
      if (!drag) return;
      var d = (ev.clientX - drag.x0) / drag.tw * 100, min = 4;
      d = Math.max(min - drag.w0, Math.min(drag.w1 - min, d));
      setW(drag.cols[drag.i], drag.w0 + d); setW(drag.cols[drag.i + 1], drag.w1 - d); placeHandles();
    });
    function endDrag() { if (!drag) return; drag.h.classList.remove('on'); drag = null; afterEdit(); placeHandles(); }
    ov.addEventListener('pointerup', endDrag); ov.addEventListener('pointercancel', endDrag);
    document.addEventListener('pointerdown', function (ev) { lastType = ev.pointerType || 'mouse'; });
    document.addEventListener('pointermove', function (ev) {
      if (drag || (ev.target.closest && ev.target.closest('#colHandles'))) return;
      var tb = ev.target.closest && ev.target.closest('.bodyEd table');
      if (tb) { if (tb !== hot) { hot = tb; placeHandles(); } } else if (hot && !caretTable()) { hot = null; placeHandles(); }
    });
    document.addEventListener('selectionchange', function () {
      if (drag) return; var ct = caretTable();
      if (ct) { if (ct !== hot) { hot = ct; placeHandles(); } } else if (hot && lastType === 'touch') { hot = null; placeHandles(); }
    });
    ['scroll', 'resize'].forEach(function (n) { window.addEventListener(n, function () { if (hot) placeHandles(); }, true); });
    document.addEventListener('input', function () { if (hot) requestAnimationFrame(placeHandles); });
    $('tIns').addEventListener('mousedown', pd);
    $('tIns').addEventListener('click', function () {
      var rw = Math.max(1, Math.min(20, +$('tRows').value || 3)), cl = Math.max(1, Math.min(6, +$('tCols').value || 3));
      var row = '<tr>' + new Array(cl + 1).join('<td><br></td>') + '</tr>';
      restoreSel();
      var cg = '<colgroup>' + new Array(cl + 1).join('<col data-w="' + (100 / cl).toFixed(2) + '" style="width:' + (100 / cl).toFixed(2) + '%">') + '</colgroup>';
      document.execCommand('insertHTML', false, '<table>' + cg + '<tbody>' + new Array(rw + 1).join(row) + '</tbody></table><div><br></div>');
      afterEdit();
    });
  }

  /* ---- helpers used by the image and AI modules ---- */
  PNP.textToHtml = function (text) {
    return String(text).replace(/\r\n?/g, '\n').split('\n').map(function (ln) {
      if (!ln.trim()) return '<div><br></div>';
      return '<div>' + PNP.esc(ln).replace(/^ +/, function (m) { return new Array(m.length + 1).join('&nbsp;'); }) + '</div>';
    }).join('');
  };
  PNP.editor = {
    init: init, setSections: setSections, getSections: getSections, afterEdit: afterEdit, showTab: showTab, restoreSel: restoreSel,
    insertHtml: function (html) { restoreSel(); document.execCommand('insertHTML', false, html); afterEdit(); },
    appendHtml: function (html) {
      var list = eds(), ed = list[list.length - 1];
      ed.insertAdjacentHTML('beforeend', (ed.textContent.trim() || ed.querySelector('img,table') ? '<div><br></div>' : '') + html); afterEdit();
    },
    /* Returns { text, range } for a non-empty selection inside the body, otherwise null. */
    selection: function () {
      var ed = activeEd && document.body.contains(activeEd) ? activeEd : null;
      if (!ed || !lastRange || lastRange.collapsed || !ed.contains(lastRange.startContainer) || !ed.contains(lastRange.endContainer)) return null;
      var tmp = document.createElement('div'); tmp.appendChild(lastRange.cloneContents());
      var text = PNP.plain(PNP.clean(tmp.innerHTML));
      return text ? { text: text, range: lastRange.cloneRange() } : null;
    },
    hasRichContent: function () { return eds().some(function (e) { return !!e.querySelector('img,table'); }); },
    plainBody: function () { return PNP.plain(PNP.joinSections(getSections())); },
  };
})();
