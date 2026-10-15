/* STANDALONE MODE (single HTML file, no server). Replaces PNP.api with a browser-side implementation of the same
   endpoints: memos live in localStorage, images are embedded in the memo, the */
(function () {
  'use strict';
  var PNP = window.PNP, STORE = 'pnp.local.memos';

  function err(status, msg) { var e = new Error(msg); e.status = status; return e; }
  function ok(v) { return Promise.resolve(v); }
  function no(s, m) { return Promise.reject(err(s, m)); }
  function readAll() { try { return JSON.parse(localStorage.getItem(STORE) || '[]'); } catch (e) { return []; } }
  function writeAll(a) {
    try { localStorage.setItem(STORE, JSON.stringify(a)); }
    catch (e) { throw err(507, 'Browser storage is full. Delete old memos or use smaller images.'); }
  }
  function newId() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
  function summary(m) { return { id: m.id, subject: m.subject, to: m.to, date: m.date, status: m.status, classification: m.classification, paperSize: m.paperSize, updatedAt: m.updatedAt, createdAt: m.createdAt }; }
  function bodyText(m) { return PNP.plain(PNP.joinSections(m.sections)); }
  function clamp(b) {
    var m = {};
    ['to', 'attn', 'from', 'fileName', 'subject', 'date', 'signatoryName', 'signatoryRank'].forEach(function (k) { m[k] = String(b[k] == null ? '' : b[k]).slice(0, 500); });
    m.sections = (Array.isArray(b.sections) ? b.sections : ['']).slice(0, 20).map(function (s) { return PNP.clean(String(s)); });
    m.forLabel = b.forLabel === 'TO' ? 'TO' : 'FOR';
    m.paperSize = PNP.PAPERS[b.paperSize] ? b.paperSize : 'a4';
    m.classification = b.classification in PNP.CLASSES ? b.classification : 'CONFIDENTIAL';
    m.status = b.status === 'final' ? 'final' : 'draft';
    return m;
  }

  function fileToData(blob) {
    return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = rej; r.readAsDataURL(blob); });
  }

  /* ---- the API ---- */
  function route(method, path, body) {
    var u = new URL(path, 'http://x'), p = u.pathname, mt, all;
    if (p === '/api/config') return ok({ authRequired: false, authed: true, ai: false, pdf: false, maxImageBytes: 700 * 1024 });
    if (p === '/api/login' || p === '/api/logout') return ok({ ok: true });
    if (p === '/api/pdf') return no(501, 'Use the print window and choose Save as PDF.');
    if (p === '/api/export/memos') {
      return ok({ items: readAll().map(function (m) { var s = summary(m); s.from = m.from; s.attn = m.attn; s.bodyText = bodyText(m); s.signatoryName = m.signatoryName; s.signatoryRank = m.signatoryRank; return s; }) });
    }
    if (p === '/api/memos') {
      all = readAll();
      if (method === 'GET') {
        var q = (u.searchParams.get('q') || '').toLowerCase(), items = all.filter(function (m) {
          return !q || [m.subject, m.to, m.from, m.attn, bodyText(m)].join('\n').toLowerCase().indexOf(q) > -1;
        }).sort(function (a, b) { return a.updatedAt < b.updatedAt ? 1 : -1; });
        return ok({ total: items.length, items: items.slice(0, 100).map(summary) });
      }
      if (method === 'POST') {
        var m = clamp(body || {}), t = new Date().toISOString();
        m.id = newId(); m.version = 1; m.createdAt = t; m.updatedAt = t; all.push(m);
        try { writeAll(all); } catch (e) { return Promise.reject(e); }
        return ok(m);
      }
    }
    if ((mt = p.match(/^\/api\/memos\/([\w-]+)$/))) {
      all = readAll(); var i = all.findIndex(function (x) { return x.id === mt[1]; });
      if (i < 0) return no(404, 'Memorandum not found.');
      if (method === 'GET') return ok(all[i]);
      if (method === 'DELETE') { all.splice(i, 1); writeAll(all); return ok({ ok: true }); }
      if (method === 'PUT') {
        if (Number.isInteger(body.version) && body.version !== all[i].version) return no(409, 'This memorandum was changed elsewhere. Reload it before saving.');
        var n = clamp(body); n.id = all[i].id; n.createdAt = all[i].createdAt; n.version = all[i].version + 1; n.updatedAt = new Date().toISOString(); all[i] = n;
        try { writeAll(all); } catch (e) { return Promise.reject(e); }
        return ok(n);
      }
    }
    return no(404, 'Not found.');
  }
  function wrap(method) { return function (p, b) { try { return route(method, p, b); } catch (e) { return Promise.reject(e); } }; }

  PNP.api = {
    get: wrap('GET'), post: wrap('POST'), put: wrap('PUT'), del: wrap('DELETE'),
    upload: function (blob) {
      if (!/^image\/(png|jpeg|webp)$/.test(blob.type)) return no(415, 'Unsupported file. Please upload a PNG, JPEG or WebP image.');
      return fileToData(blob).then(function (url) {
        return new Promise(function (res, rej) { var im = new Image(); im.onload = function () { res({ url: url, width: im.naturalWidth, height: im.naturalHeight }); }; im.onerror = function () { rej(err(415, 'That image could not be read.')); }; im.src = url; });
      });
    },
    pdf: function () { return no(501, 'No PDF service in standalone mode.'); },
  };
})();
