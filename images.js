/* Image upload / insert / resize / align / replace / remove for the memorandum body. */
(function () {
  'use strict';
  var PNP = window.PNP, $ = PNP.$;
  var TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
  var MAX_SIDE = 1400, SHRINK_ABOVE = 250 * 1024, BODY_PX = 554; /* approx. text width on A4 at 96dpi */
  var selected = null, mode = 'insert', maxBytes = 5 * 1024 * 1024;

  /* Identify the real format from the first bytes; never trust the name or MIME alone. */
  function sniff(file) {
    return file.slice(0, 12).arrayBuffer().then(function (buf) {
      var b = new Uint8Array(buf), s = String.fromCharCode.apply(null, b);
      if (b[0] === 0x89 && s.slice(1, 4) === 'PNG') return 'image/png';
      if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
      if (s.slice(0, 4) === 'RIFF' && s.slice(8, 12) === 'WEBP') return 'image/webp';
      return null;
    });
  }
  /* Downscale big phone photos (also strips EXIF/GPS) so uploads stay small on field connections. */
  function prepare(file, type) {
    if (!window.createImageBitmap) return Promise.resolve(file);
    return createImageBitmap(file, { imageOrientation: 'from-image' }).then(function (bmp) {
      var big = Math.max(bmp.width, bmp.height) > MAX_SIDE;
      if (!big && file.size <= SHRINK_ABOVE) { bmp.close && bmp.close(); return file; }
      var k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
      var c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      var g = c.getContext('2d');
      var asPng = type !== 'image/jpeg';
      if (!asPng) { g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); }
      g.drawImage(bmp, 0, 0, c.width, c.height); bmp.close && bmp.close();
      return new Promise(function (res) { c.toBlob(function (bl) { res(bl || file); }, asPng ? 'image/png' : 'image/jpeg', 0.86); });
    }, function () { return file; });
  }

  function validateAndUpload(file) {
    if (!file) return Promise.reject(new Error('No file selected.'));
    var ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!/^(png|jpe?g|webp)$/.test(ext) && !TYPES[file.type]) return Promise.reject(new Error('Unsupported file type. Use a PNG, JPEG or WebP image.'));
    return sniff(file).then(function (type) {
      if (!type) throw new Error('That file is not a valid PNG, JPEG or WebP image.');
      return prepare(file, type);
    }).then(function (blob) {
      if (blob.size > maxBytes) throw new Error('Image is too large (max ' + Math.round(maxBytes / 1048576) + ' MB).');
      return PNP.api.upload(blob, file.name);
    });
  }

  function select(img) {
    if (selected && selected !== img) selected.classList.remove('sel');
    selected = img; if (img) img.classList.add('sel');
    refresh();
  }
  function refresh() {
    if (selected && !document.body.contains(selected)) selected = null;
    var on = !!selected;
    $('picTools').classList.toggle('picoff', !on);
    $('picHint').textContent = on ? 'Image selected' : 'Click an image in the text to edit it. Then drag it on the page to place it anywhere.';
    if (!on) return;
    var w = parseFloat(selected.getAttribute('data-w')) || 50;
    $('picW').value = w; $('picWn').value = Math.round(w);
    var a = selected.getAttribute('data-align') || 'center';
    Array.prototype.forEach.call(document.querySelectorAll('[data-pa]'), function (b) { b.classList.toggle('on', b.dataset.pa === a); });
  }

  function insertFile(file) {
    var m = mode; mode = 'insert';
    PNP.toast('Uploading image\u2026', 15000);
    return validateAndUpload(file).then(function (r) {
      if (m === 'replace' && selected && document.body.contains(selected)) {
        selected.setAttribute('src', r.url); PNP.editor.afterEdit(); PNP.toast('Image replaced.');
        return;
      }
      var pct = Math.max(10, Math.min(60, Math.round(r.width / BODY_PX * 100)));
      PNP.editor.insertHtml('<img src="' + r.url + '" alt="" data-w="' + pct + '" data-align="center" style="width:' + pct + '%">');
      var img = document.querySelector('.bodyEd img[src="' + r.url + '"]');
      if (img) select(img);
      PNP.toast('Image inserted. Use the Insert tab to resize or move it.');
    }).catch(function (e) { PNP.toast(e.message || 'Image upload failed.', 6000); });
  }

  function setWidth(v) {
    if (!selected) return;
    v = Math.max(5, Math.min(100, Math.round(+v || 50)));
    selected.setAttribute('data-w', v); selected.style.width = v + '%';   /* height stays "auto": aspect ratio is always kept */
    $('picW').value = v; $('picWn').value = v; PNP.editor.afterEdit();
  }

  function init(cfg) {
    if (cfg && cfg.maxImageBytes) maxBytes = cfg.maxImageBytes;
    var input = $('imgFile');
    $('imgUpload').addEventListener('mousedown', function (e) { e.preventDefault(); });
    $('imgUpload').addEventListener('click', function () { mode = 'insert'; input.value = ''; input.click(); });
    $('picReplace').addEventListener('click', function () { if (!selected) return; mode = 'replace'; input.value = ''; input.click(); });
    input.addEventListener('change', function () { if (input.files[0]) insertFile(input.files[0]); });
    $('picW').addEventListener('input', function () { setWidth($('picW').value); });
    $('picWn').addEventListener('change', function () { setWidth($('picWn').value); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-pa]'), function (b) {
      b.addEventListener('click', function () { if (!selected) return; selected.setAttribute('data-align', b.dataset.pa); refresh(); PNP.editor.afterEdit(); });
    });
    $('picRemove').addEventListener('click', function () {
      if (!selected) return; var i = selected; selected = null; i.remove(); refresh(); PNP.editor.afterEdit();
    });
    document.addEventListener('mousedown', function (e) {
      var t = e.target;
      if (t.tagName === 'IMG' && t.closest('.bodyEd')) return;
      if (t.closest && t.closest('#picTools')) return;
      if (selected) select(null);
    });
    $('picReset').addEventListener('click', function () {
      if (!selected) return;
      ['data-x', 'data-y'].forEach(function (a) { selected.removeAttribute(a); });
      selected.style.position = selected.style.left = selected.style.top = ''; PNP.editor.afterEdit();
    });
    /* Drag any picture on the page preview to place it freely (saved as an offset on the picture in the text box). */
    var drag = null, lim = function (v) { return Math.max(-800, Math.min(800, v)); };
    document.addEventListener('pointerdown', function (e) {
      var t = e.target;
      if (!t || t.tagName !== 'IMG' || !t.closest('.pages .clip')) return;
      var idx = Array.prototype.indexOf.call(t.closest('.flow').querySelectorAll('img'), t), src = document.querySelectorAll('.bodyEd img')[idx];
      if (!src) return;
      e.preventDefault(); select(src);
      var ox = parseFloat(src.getAttribute('data-x')) || 0, oy = parseFloat(src.getAttribute('data-y')) || 0;
      drag = { t: t, src: src, z: parseFloat(t.closest('.sheet').style.zoom) || 1, sx: e.clientX, sy: e.clientY, ox: ox, oy: oy, nx: ox, ny: oy };
      if (t.setPointerCapture) { try { t.setPointerCapture(e.pointerId); } catch (x) {} }
      t.classList.add('drag');
    });
    document.addEventListener('pointermove', function (e) {
      if (!drag) return;
      drag.nx = lim(drag.ox + (e.clientX - drag.sx) / drag.z); drag.ny = lim(drag.oy + (e.clientY - drag.sy) / drag.z);
      drag.t.style.position = 'relative'; drag.t.style.left = drag.nx + 'px'; drag.t.style.top = drag.ny + 'px';
    });
    function drop() {
      if (!drag) return; var d = drag; drag = null; d.t.classList.remove('drag');
      if (d.nx === d.ox && d.ny === d.oy) return;
      var x = Math.round(d.nx), y = Math.round(d.ny);
      d.src.setAttribute('data-x', x); d.src.setAttribute('data-y', y);
      d.src.style.position = 'relative'; d.src.style.left = x + 'px'; d.src.style.top = y + 'px';
      PNP.editor.afterEdit(); refresh();
    }
    document.addEventListener('pointerup', drop); document.addEventListener('pointercancel', drop);
    $('secs').addEventListener('click', function (e) {
      if (e.target.tagName === 'IMG') { select(e.target); PNP.editor.showTab('insert'); }
    });
    refresh();
  }
  PNP.images = { init: init, insertFile: insertFile, refresh: refresh, select: select };
})();
