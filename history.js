/* History: every memorandum you made is kept in this browser (localStorage) and listed newest first.
   A memo is added when you download its PDF, print it, start a new one, or open another one from History.
   Nothing leaves the device. */
(function () {
  'use strict';
  var $ = PNP.$, KEY = 'pnp.history', MAX = 100;
  var FIELDS = ['to', 'attn', 'from', 'forLabel', 'fileName', 'subject', 'date', 'sections', 'signatoryName', 'signatoryRank', 'classification'];

  function load() { try { var a = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function store(items) {
    items = items.slice(0, MAX);
    for (;;) {
      try { localStorage.setItem(KEY, JSON.stringify(items)); return true; }
      catch (e) {
        if (items.length > 1) { items.pop(); continue; }                       /* browser storage full: drop the oldest */
        if (items.length === 1 && /<img/i.test(JSON.stringify(items[0].sections))) {   /* one huge memo: keep it without its pictures */
          items[0].sections = items[0].sections.map(function (s) { return String(s).replace(/<img[^>]*>/gi, ''); });
          PNP.toast('History kept this memo without its pictures (browser storage is full).', 6000); continue;
        }
        return false;
      }
    }
  }
  function bodyText(m) { try { return PNP.plain(PNP.joinSections(m.sections || [])).trim(); } catch (e) { return ''; } }
  function hasContent(m) { return !!(String(m.to || '').trim() || String(m.subject || '').trim() || String(m.from || '').trim() || bodyText(m)); }

  /* how: 'pdf' (downloaded / printed) or 'draft' (left behind unfinished) */
  function record(m, how) {
    if (!m || !hasContent(m)) return;
    var items = load(), id = m.id || ('h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)), old = null, now = Date.now(), i;
    for (i = 0; i < items.length; i++) if (items[i].id === id) { old = items[i]; items.splice(i, 1); break; }
    var e = JSON.parse(JSON.stringify(FIELDS.reduce(function (o, k) { o[k] = m[k]; return o; }, {})));
    e.id = id; e.createdAt = old ? old.createdAt : now; e.updatedAt = now;
    e.status = (old && old.status === 'pdf') || how === 'pdf' ? 'pdf' : 'draft';
    items.unshift(e); store(items); m.id = id;
    if ($('histDlg') && $('histDlg').open) render();
  }

  function esc(t) { var d = document.createElement('div'); d.textContent = t == null ? '' : String(t); return d.innerHTML; }
  function fmt(ts) { try { return new Date(ts).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return ''; } }
  function render() {
    var q = String($('histQ').value || '').trim().toLowerCase(), items = load(), box = $('histList');
    var shown = items.filter(function (e) { return !q || [e.subject, e.to, e.from, e.attn].join(' ').toLowerCase().indexOf(q) > -1; });
    $('histCount').textContent = items.length ? '(' + items.length + ')' : '';
    $('histClear').hidden = !items.length;
    if (!shown.length) { box.innerHTML = '<p class="msg">' + (items.length ? 'Nothing matches your search.' : 'No memorandums yet. When you download a PDF, print, or start a new memo, it is added here.') + '</p>'; return; }
    box.innerHTML = shown.map(function (e) {
      return '<div class="hItem" data-id="' + esc(e.id) + '"><div class="hMain"><b class="hSub">' + esc(e.subject || '(no subject)') + '</b>' +
        '<div class="hMeta">' + esc((e.forLabel === 'TO' ? 'To' : 'For') + ': ' + (e.to || '\u2014')) + ' \u00b7 ' + esc(PNP.fmtDate(e.date)) + '</div>' +
        '<div class="hMeta">' + esc(fmt(e.updatedAt)) + ' \u00b7 <span class="hTag ' + (e.status === 'pdf' ? 'pdf' : 'draft') + '">' + (e.status === 'pdf' ? 'PDF / printed' : 'Draft') + '</span></div></div>' +
        '<div class="hBtns"><button type="button" class="sec" data-a="open">Open</button><button type="button" class="ghost" data-a="copy" title="Start a new memo from this one">Copy</button><button type="button" class="ghost" data-a="del">Delete</button></div></div>';
    }).join('');
  }
  function find(id) { return load().filter(function (e) { return e.id === id; })[0]; }
  function openEntry(e, asCopy) {
    var cur = PNP.app.getMemo();
    if (hasContent(cur) && !(cur.id && cur.id === e.id)) { record(cur, 'draft'); }   /* what you were writing goes to History first */
    var m = JSON.parse(JSON.stringify(e));
    if (asCopy) { delete m.id; m.date = PNP.todayISO(); }
    PNP.app.setMemo(m, true);
    $('histDlg').close(); document.body.dataset.view = 'edit';
    Array.prototype.forEach.call(document.querySelectorAll('#viewSwitch [data-v]'), function (b) { b.classList.toggle('on', b.dataset.v === 'edit'); });
    window.scrollTo(0, 0); PNP.toast(asCopy ? 'Copied into a new memorandum.' : 'Opened from History.');
  }

  $('histBtn').addEventListener('click', function () { $('histQ').value = ''; render(); $('histDlg').showModal(); });
  if ($('histBtn2')) $('histBtn2').addEventListener('click', function () { $('histBtn').click(); });
  $('histClose').addEventListener('click', function () { $('histDlg').close(); });
  $('histQ').addEventListener('input', render);
  $('histClear').addEventListener('click', function () {
    if (confirm('Delete ALL memorandums from History? This cannot be undone.')) { try { localStorage.removeItem(KEY); } catch (e) {} render(); }
  });
  $('histList').addEventListener('click', function (ev) {
    var b = ev.target.closest('button[data-a]'), row = ev.target.closest('.hItem'); if (!b || !row) return;
    var id = row.dataset.id, e = find(id); if (!e) return;
    if (b.dataset.a === 'open') openEntry(e, false);
    else if (b.dataset.a === 'copy') openEntry(e, true);
    else if (b.dataset.a === 'del' && confirm('Delete this memorandum from History?')) { store(load().filter(function (x) { return x.id !== id; })); render(); }
  });

  PNP.history = { record: record, hasContent: hasContent };
})();
