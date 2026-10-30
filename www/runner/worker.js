// Chaman code runner: worker source (step16). The app reads this file as text and starts it as a blob worker inside a sandboxed iframe
// whose Content-Security-Policy has no network (connect-src blob: only). One worker per language: js, sql, py.
// App -> worker: {t:'init', lang, files}  -> worker answers {t:'ready'}
//                {t:'run', id, code, max, tables, db} -> {t:'res', id, ok, out, val, err, ms}
//                {t:'net-res', id, ...} answers a {t:'net'} request (js only, the app checks the allowed sites)
'use strict';
const POST = self.postMessage.bind(self);
const CAP = 30000;
let LANG = '', SQL = null, PY = null;
const NETP = {};
let NID = 0;

function fmtv(v) {
  if (typeof v === 'string') return v;
  if (v === undefined) return 'undefined';
  if (v === null || typeof v === 'boolean') return String(v);
  if (typeof v === 'number') return Object.is(v, -0) ? '-0' : String(v);
  if (typeof v === 'bigint') return v.toString() + 'n';
  if (typeof v === 'function') return '[Function' + (v.name ? ': ' + v.name : '') + ']';
  if (typeof v === 'symbol') return v.toString();
  if (v instanceof Error) return v.name + ': ' + v.message;
  if (v instanceof Date) return isNaN(v) ? 'Invalid Date' : v.toString() + ' (' + v.toISOString() + ')';
  if (ArrayBuffer.isView(v) && !(v instanceof DataView)) return '[' + Array.prototype.slice.call(v, 0, 200).join(', ') + (v.length > 200 ? ', ...' : '') + ']';
  try {
    const stack = [];
    const s = JSON.stringify(v, function (k, x) {
      if (typeof x === 'bigint') return x.toString() + 'n';
      if (typeof x === 'function') return '[Function]';
      if (typeof x === 'number' && !isFinite(x)) return String(x);
      if (x instanceof Map) x = { '[Map]': Array.from(x.entries()) };
      else if (x instanceof Set) x = { '[Set]': Array.from(x.values()) };
      else if (x instanceof Error) return x.name + ': ' + x.message;
      if (x && typeof x === 'object') {
        while (stack.length && stack[stack.length - 1] !== this) stack.pop();
        if (stack.indexOf(x) >= 0) return '[Circular]';
        stack.push(x);
      }
      return x;
    }, 2);
    return s === undefined ? String(v) : s;
  } catch (e) { return String(v); }
}

// ---------- js ----------
async function runJS(m) {
  const out = [];
  let n = 0;
  const push = s => { if (n < CAP) { out.push(s); n += s.length + 1; } };
  const line = (p, a) => push(p + a.map(fmtv).join(' '));
  const con = {
    log: (...a) => line('', a), info: (...a) => line('', a), debug: (...a) => line('', a),
    warn: (...a) => line('warn: ', a), error: (...a) => line('error: ', a),
    table: (...a) => line('', a), dir: (...a) => line('', a)
  };
  const AF = Object.getPrototypeOf(async function () {}).constructor;
  let f = null;
  try { f = new AF('console', 'return (' + m.code + '\n)'); } catch (e) { f = null; } // an expression: its value is returned
  if (!f) {
    try { f = new AF('console', m.code); } catch (e) { return { ok: false, out: '', err: (e && e.name || 'SyntaxError') + ': ' + (e && e.message) }; }
  }
  let val, err = '';
  try { val = await f(con); } catch (e) { err = (e && e.name ? e.name : 'Error') + ': ' + (e && e.message !== undefined ? e.message : String(e)); }
  return { ok: !err, out: out.join('\n'), val: val === undefined ? undefined : fmtv(val), err };
}

// ---------- sql ----------
function sqlCell(v) {
  if (v === null) return 'NULL';
  if (v instanceof Uint8Array) return '<blob ' + v.length + ' bytes>';
  const s = String(v).replace(/\s+/g, ' ');
  return s.length > 60 ? s.slice(0, 57) + '...' : s;
}
function sqlTable(r, max) {
  const show = r.values.slice(0, max);
  const L = [r.columns.join(' | '), r.columns.map(() => '---').join(' | ')];
  show.forEach(x => L.push(x.map(sqlCell).join(' | ')));
  L.push('(' + r.values.length + ' row' + (r.values.length === 1 ? '' : 's') + (r.values.length > show.length ? ', first ' + show.length + ' shown' : '') + ')');
  return L.join('\n');
}
function runSQL(m) {
  let db;
  try {
    db = m.db ? new SQL.Database(new Uint8Array(m.db)) : new SQL.Database();
    for (const t of m.tables || []) {
      db.run('CREATE TABLE "' + t.name + '" (' + t.cols.map((c, i) => '"' + c + '" ' + t.types[i]).join(', ') + ')');
      db.run('BEGIN');
      const st = db.prepare('INSERT INTO "' + t.name + '" VALUES (' + t.cols.map(() => '?').join(',') + ')');
      for (const r of t.rows) st.run(r);
      st.free();
      db.run('COMMIT');
    }
    const res = db.exec(m.code);
    const max = Math.max(1, Math.min(200, m.max || 50));
    const out = res.length ? res.map(r => sqlTable(r, max)).join('\n\n') : '(no rows returned)';
    return { ok: true, out, err: '' };
  } catch (e) {
    return { ok: false, out: '', err: 'SQL error: ' + (e && e.message ? e.message : String(e)) };
  } finally {
    try { if (db) db.close(); } catch (e) {}
  }
}

// ---------- py (MicroPython) ----------
function pyMake() {
  const p = PY.mod.loadMicroPython({
    url: PY.wurl, linebuffer: true, heapsize: 4 * 1048576, pystack: 8192,
    stdout: l => { if (PY.out) PY.out.push(l); },
    stderr: l => { if (PY.out) PY.out.push(l); }
  });
  p.catch(() => {});
  return p;
}
async function runPY(m) {
  const mp = await PY.mp;
  PY.mp = null;
  PY.out = [];
  let err = '';
  try { await mp.runPythonAsync(m.code); }
  catch (e) {
    if (e && e.name === 'PythonError' && e.type === 'SystemExit') err = '';
    else err = String(e && e.message !== undefined ? e.message : e).trim();
  }
  const out = PY.out.join('\n');
  PY.out = null;
  PY.mp = pyMake(); // the next run gets a fresh interpreter, prepared now
  return { ok: !err, out, err };
}

// ---------- start ----------
async function init(m) {
  LANG = m.lang;
  const F = m.files || {};
  if (LANG === 'js') {
    // the only way out: fetch goes through the app, which allows only the sites Najeef listed. Everything else is blocked by the CSP.
    self.fetch = function (u, o) {
      o = o || {};
      return new Promise((res, rej) => {
        const id = ++NID;
        NETP[id] = { res, rej };
        const h = {};
        if (o.headers && typeof o.headers === 'object') Object.keys(o.headers).slice(0, 10).forEach(k => { h[String(k)] = String(o.headers[k]); });
        POST({ t: 'net', id, url: typeof u === 'string' ? u : String((u && u.url) || u), method: String(o.method || 'GET').toUpperCase(), headers: h, body: typeof o.body === 'string' ? o.body : undefined });
      });
    };
  } else if (LANG === 'sql') {
    importScripts(URL.createObjectURL(new Blob([F.js], { type: 'text/javascript' })));
    SQL = await self.initSqlJs({ wasmBinary: F.wasm });
  } else if (LANG === 'py') {
    PY = { out: null };
    PY.wurl = URL.createObjectURL(new Blob([F.wasm], { type: 'application/wasm' }));
    PY.mod = await import(URL.createObjectURL(new Blob([F.mjs], { type: 'text/javascript' })));
    PY.mp = pyMake();
    await PY.mp;
  }
}

self.onmessage = async e => {
  const m = e.data || {};
  try {
    if (m.t === 'init') { await init(m); POST({ t: 'ready' }); }
    else if (m.t === 'run') {
      const t0 = Date.now();
      const r = LANG === 'js' ? await runJS(m) : LANG === 'sql' ? runSQL(m) : await runPY(m);
      r.t = 'res'; r.id = m.id; r.ms = Date.now() - t0;
      POST(r);
    } else if (m.t === 'net-res') {
      const p = NETP[m.id];
      delete NETP[m.id];
      if (!p) return;
      if (m.err) p.rej(new Error(m.err));
      else p.res(new Response(m.text, { status: m.status >= 200 && m.status <= 599 ? m.status : 200 }));
    }
  } catch (err) {
    const msg = String(err && err.message !== undefined ? err.message : err);
    if (m.t === 'run') POST({ t: 'res', id: m.id, ok: false, out: '', err: msg, ms: 0 });
    else POST({ t: 'ierr', err: msg });
  }
};
