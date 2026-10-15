/* Thin fetch wrapper for the backend. Same-origin only; the custom header is the CSRF guard the server checks. */
(function () {
  'use strict';
  var PNP = window.PNP;

  function fail(status, msg) {
    var e = new Error(msg || 'Request failed.'); e.status = status;
    if (status === 401 && PNP.onAuthRequired) PNP.onAuthRequired();
    return e;
  }
  function request(method, path, body, raw) {
    var opt = { method: method, credentials: 'same-origin', headers: { 'X-Requested-With': 'pnp' } };
    if (raw) { opt.body = raw.body; for (var k in raw.headers) opt.headers[k] = raw.headers[k]; }
    else if (body !== undefined) { opt.body = JSON.stringify(body); opt.headers['Content-Type'] = 'application/json'; }
    return fetch(path, opt).then(function (r) {
      var ct = r.headers.get('content-type') || '';
      if (ct.indexOf('application/json') > -1) {
        return r.json().then(function (d) { if (!r.ok) throw fail(r.status, d && d.error); return d; });
      }
      if (!r.ok) throw fail(r.status, 'Request failed (' + r.status + ').');
      return r;
    }, function () { throw fail(0, 'Cannot reach the server. Check your connection.'); });
  }

  PNP.api = {
    get: function (p) { return request('GET', p); },
    post: function (p, b) { return request('POST', p, b); },
    put: function (p, b) { return request('PUT', p, b); },
    del: function (p) { return request('DELETE', p); },
    upload: function (blob, name) {
      return request('POST', '/api/images', undefined, { body: blob, headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': encodeURIComponent(name || 'image') } });
    },
    pdf: function (memo) { return request('POST', '/api/pdf', memo).then(function (r) { return r.blob(); }); },
  };
})();
