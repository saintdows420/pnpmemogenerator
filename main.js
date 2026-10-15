/* Application wiring: central memo state, form bindings, live preview, paper size, drafts, sign-in. */
(function () {
  'use strict';
  var PNP = window.PNP, $ = PNP.$;
  var DEFAULT_SIG = { name: '', rank: '' };   /* nothing is pre-filled: the user types the signatory */
  var state, refs, statusTimer;

  /* Name used for the saved PDF / printout: typed file name, otherwise the Subject. */
  PNP.fileBase = function (m) {
    var n = String(m.fileName || '').trim() || String(m.subject || '').trim();
    n = n.replace(/[\\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '').slice(0, 100);
    return n || 'Memorandum';
  };
  function blank(keepFrom) {
    var k = keepFrom || {};
    return { id: null, version: null, to: '', attn: '', from: '', forLabel: 'FOR', fileName: '', subject: '', date: PNP.todayISO(), sections: [''],
      signatoryName: k.signatoryName != null ? k.signatoryName : DEFAULT_SIG.name, signatoryRank: k.signatoryRank != null ? k.signatoryRank : DEFAULT_SIG.rank,
      paperSize: 'a4', classification: 'CONFIDENTIAL', status: 'draft', dirty: false, savedAt: null };
  }

  /* Local safety copy of unsaved work (survives reloads / lost connections). Never written for saved memos. */
  var saveDraft = PNP.debounce(function () { if (state.dirty) PNP.pref.set('draft', JSON.stringify(state)); }, 700);

  function renderPreview() {
    PNP.doc.update(refs, state);
    document.title = PNP.fileBase(state);
  }
  function applyPaper() {
    $('pg').textContent = PNP.doc.pageRule(state.paperSize);
    PNP.doc.fit(refs, document.querySelector('.preview'), state.paperSize);
  }

  /* Any edit anywhere ends up here. */
  function changed() {
    state.dirty = true; renderPreview(); saveDraft();
  }

  var FIELDS = [['to', 'to'], ['attn', 'attn'], ['from', 'from'], ['forLabel', 'forLbl'], ['fileName', 'fname'], ['subject', 'subject'], ['date', 'date'], ['signatoryName', 'sname'], ['signatoryRank', 'srank'],
    ['classification', 'cls']];
  function readForm() { FIELDS.forEach(function (f) { state[f[0]] = $(f[1]).value; }); }
  function writeForm() { FIELDS.forEach(function (f) { $(f[1]).value = state[f[0]] == null ? '' : state[f[0]]; }); }

  function setMemo(m, clean) {
    var next = blank();
    ['id', 'version', 'to', 'attn', 'from', 'forLabel', 'fileName', 'subject', 'date', 'signatoryName', 'signatoryRank', 'paperSize', 'classification', 'status'].forEach(function (k) { if (m[k] != null) next[k] = m[k]; });
    next.sections = Array.isArray(m.sections) && m.sections.length ? m.sections : [''];
    if (!PNP.PAPERS[next.paperSize]) next.paperSize = 'a4';
    if (!(next.classification in PNP.CLASSES)) next.classification = 'CONFIDENTIAL';
    state = next; state.dirty = !clean;
    if (m.updatedAt) state.savedAt = new Date(m.updatedAt).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
    writeForm(); PNP.editor.setSections(state.sections); applyPaper(); renderPreview();
    if (state.id) PNP.pref.set('last', state.id);
    if (clean) PNP.pref.del('draft');
  }

  PNP.app = {
    get refs() { return refs; },
    getMemo: function () { readForm(); state.sections = PNP.editor.getSections(); return state; },
    setMemo: setMemo, changed: changed,
    reset: function () { PNP.pref.del('draft'); setMemo(blank(), true); },   /* New: a completely empty memorandum */
  };

  /* ---- sign-in (only shown when the server has an access code) ---- */
  function showLogin() { $('loginBox').hidden = false; $('loginCode').focus(); }
  PNP.onAuthRequired = showLogin;
  $('loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    PNP.api.post('/api/login', { code: $('loginCode').value }).then(function () {
      $('loginBox').hidden = true; $('loginCode').value = ''; $('loginMsg').textContent = ''; start();
    }).catch(function (err) { $('loginMsg').textContent = err.message; });
  });
  $('logoutBtn').addEventListener('click', function () { PNP.api.post('/api/logout').then(function () { location.reload(); }); });

  /* ---- theme ---- */
  function effTheme() { return document.documentElement.getAttribute('data-theme') || ((window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light'); }
  function setTheme(t) { document.documentElement.setAttribute('data-theme', t); $('themeBtn').textContent = t === 'dark' ? '\u2600\ufe0f Light' : '\ud83c\udf19 Dark'; PNP.pref.set('theme', t); }
  $('themeBtn').addEventListener('click', function () { setTheme(effTheme() === 'dark' ? 'light' : 'dark'); });
  (function () { var st = PNP.pref.get('theme'); setTheme(st === 'dark' || st === 'light' ? st : effTheme()); })();

  /* ---- start-up ---- */
  var started = false;
  function start() {
    if (started) return; started = true;
    PNP.api.get('/api/config').then(function (cfg) {
      if (cfg.authRequired && !cfg.authed) { started = false; showLogin(); return; }
      $('logoutBtn').hidden = !cfg.authRequired;
      PNP.images.init(cfg); PNP.store.init(cfg);
    }).catch(function (e) { started = false; PNP.toast('Could not start: ' + e.message, 6000); });
  }

  (function boot() {
    refs = PNP.doc.build($('docHost'));
    var cs = $('cls');
    [['CONFIDENTIAL', 'Confidential'], ['RESTRICTED', 'Restricted'], ['NONE', 'No Classification Text']].forEach(function (c) { var o = document.createElement('option'); o.value = c[0]; o.textContent = c[1]; cs.appendChild(o); });

    PNP.editor.init(function (sections) { state.sections = sections; changed(); });
    FIELDS.forEach(function (f) {
      var ev = f[1] === 'cls' ? 'change' : 'input';
      $(f[1]).addEventListener(ev, function () {
        readForm();
        changed();
      });
    });
    var draft = null; try { draft = JSON.parse(PNP.pref.get('draft') || 'null'); } catch (e) { /* ignore */ }
    if (draft && typeof draft === 'object') { setMemo(draft, false); PNP.toast('Restored your last draft.'); }
    else setMemo(blank(), true);
    window.addEventListener('resize', function () { PNP.doc.fit(refs, document.querySelector('.preview'), state.paperSize); });
    Array.prototype.forEach.call(document.querySelectorAll('#viewSwitch [data-v]'), function (b) {   /* phones: Edit / Preview, one at a time */
      b.addEventListener('click', function () {
        document.body.dataset.view = b.dataset.v;
        Array.prototype.forEach.call(document.querySelectorAll('#viewSwitch [data-v]'), function (x) { x.classList.toggle('on', x === b); });
        window.scrollTo(0, 0);
        requestAnimationFrame(function () { PNP.doc.fit(refs, document.querySelector('.preview'), state.paperSize); });
      });
    });
    if (window.ResizeObserver) {   /* the top bar stays in view; the ribbon sticks right under it */
      var bar = document.querySelector('header.bar');
      new ResizeObserver(function () { document.documentElement.style.setProperty('--barH', bar.offsetHeight + 'px'); }).observe(bar);
    }
    start();
  })();
})();
