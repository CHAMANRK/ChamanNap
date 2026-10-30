// Chaman code runner: frame script (step16). Runs inside a hidden sandboxed iframe (srcdoc) with a no-network CSP.
// It only relays messages between the app and the workers. User code never runs here, only inside the workers.
(function () {
  var W = {};
  var up = function (m) { parent.postMessage(m, '*'); };
  function kill(lang) {
    var ks = lang ? [lang] : Object.keys(W);
    ks.forEach(function (k) { if (W[k]) { try { W[k].terminate(); } catch (e) {} delete W[k]; } });
  }
  window.addEventListener('message', function (e) {
    if (e.source !== parent) return;
    var m = e.data || {};
    try {
      if (m.t === 'init') {
        kill(m.lang);
        var w = new Worker(URL.createObjectURL(new Blob([m.worker], { type: 'text/javascript' })));
        W[m.lang] = w;
        w.onmessage = function (ev) { var d = ev.data || {}; d.lang = m.lang; up(d); };
        w.onerror = function (ev) { up({ t: 'werr', lang: m.lang, err: String((ev && ev.message) || 'worker error') }); if (ev && ev.preventDefault) ev.preventDefault(); };
        var tr = [];
        Object.keys(m.files || {}).forEach(function (k) { if (m.files[k] instanceof ArrayBuffer) tr.push(m.files[k]); });
        w.postMessage({ t: 'init', lang: m.lang, files: m.files }, tr);
      } else if (m.t === 'run') {
        if (W[m.lang]) W[m.lang].postMessage(m, m.db instanceof ArrayBuffer ? [m.db] : []);
      } else if (m.t === 'net-res') {
        if (W[m.lang]) W[m.lang].postMessage(m);
      } else if (m.t === 'kill') {
        kill(m.lang);
      }
    } catch (err) {
      up({ t: 'ferr', lang: m.lang, err: String((err && err.message) || err) });
    }
  });
  up({ t: 'frame-ready' });
})();
