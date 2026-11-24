// Step16: run_code. JavaScript, SQL (SQLite) and MicroPython run inside the app, no Termux.
// Safety: user code runs only in a blob worker inside a hidden sandboxed iframe whose CSP has no network, so it cannot reach Files, Termux,
// the screen, keys or the internet. js fetch is the only door: it goes through rnNet(), which allows only the sites Najeef listed in Settings.
const RN_LANGS = ['js', 'sql', 'py'];
const RN_ASSETS = { sql: { js: 'runner/sql-wasm.js', wasm: 'runner/sql-wasm.wasm' }, py: { mjs: 'runner/micropython.mjs', wasm: 'runner/micropython.wasm' } };
const RN_MAX = 4000;
const RN = { frame: null, fp: null, sbx: 'allow-scripts', fb: false, files: {}, ready: {}, boot: {}, pend: {}, q: {}, seq: 0, err: '' };

TOOLS.push(fn('run_code', 'Run a small piece of code inside the app, no Termux needed. lang js: JavaScript (async/await ok; show results with console.log or end with a value / return it). lang sql: SQLite; pass csv (workspace CSV files, each becomes a table named after the file) or db (a .db/.sqlite file, opened in memory). lang py: MicroPython (small scripts, print the result; json, math, re, random, time, datetime, collections available; no numpy, no pip). Output max 4000 characters, 10 s limit (timeout_s up to 30). The code cannot touch files, phone, screen or keys. Internet only from js fetch to sites Najeef allowed in Settings. Use it for exact math, dates and times (js new Date()), counts, conversions, regex, JSON and data queries instead of guessing.', {
  lang: { type: 'string', enum: RN_LANGS },
  code: { type: 'string' },
  csv: { type: 'array', items: { type: 'string' }, description: 'sql only: workspace CSV paths' },
  db: { type: 'string', description: 'sql only: workspace .db or .sqlite file' },
  timeout_s: { type: 'integer', minimum: 1, maximum: 30 },
  max_rows: { type: 'integer', minimum: 1, maximum: 200, description: 'sql: rows shown per result, default 50' }
}, ['lang', 'code']));

TOOLS.push(fn('js_site_check', 'Check which internet sites run_code js fetch may use. Without host it lists the allowed sites (the default ones plus the ones Najeef added in Settings > Code runner). With host (a site name or a https URL) it says allowed or not allowed, with the same check fetch uses, and makes no network call. With host and test true it also makes one real GET to that allowed site and reports the status, the time and whether the site redirected somewhere else. Use it before a js fetch when you are not sure the site is allowed or working. If a site you need is not allowed, tell Najeef to add it in Settings > Code runner; never try to get around the list.', {
  host: { type: 'string', description: 'optional: site name or URL to check' },
  test: { type: 'boolean', description: 'with host: also make one real GET (needs an allowed site)' }
}));

const rnOn = () => !(S.rn && S.rn.on === false);
function rnClip(s) {
  s = String(s == null ? '' : s);
  return s.length <= RN_MAX ? s : s.slice(0, 3000) + '\n...(' + (s.length - 3700) + ' chars cut)...\n' + s.slice(-700);
}

// ---------- assets, frame, workers ----------
async function rnAsset(path, text) {
  const k = path + (text ? ':t' : ':b');
  if (RN.files[k]) return RN.files[k];
  const r = await fetch(path);
  if (!r.ok) throw new Error(path + ' load nahi hua (' + r.status + ')');
  return (RN.files[k] = text ? await r.text() : await r.arrayBuffer());
}
const RN_CSP = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob:; worker-src blob:; connect-src blob:";
function rnHtml(js) {
  return '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="' + RN_CSP + '"></head><body><script>' + js.replace(/<\/script/gi, '<\\/script') + '<\/script></body></html>';
}
function rnReset() {
  try { if (RN.frame && RN.frame.parentNode) RN.frame.parentNode.removeChild(RN.frame); } catch (e) {}
  RN.frame = null; RN.fp = null; RN.ready = {};
  Object.keys(RN.boot).forEach(k => { try { RN.boot[k].rej(new Error('runner reset')); } catch (e) {} });
  RN.boot = {};
  Object.keys(RN.pend).forEach(k => { try { RN.pend[k].res({ ok: false, out: '', err: 'Runner reset hua, dobara chalao.' }); } catch (e) {} });
  RN.pend = {};
}
function rnFrame() {
  if (RN.fp) return RN.fp;
  RN.fp = (async () => {
    if (typeof Worker === 'undefined') throw new Error('Is WebView me Worker nahi hai.');
    const js = await rnAsset('runner/frame.js', true);
    return new Promise((res, rej) => {
      const f = document.createElement('iframe');
      f.setAttribute('sandbox', RN.sbx);
      f.setAttribute('aria-hidden', 'true');
      f.tabIndex = -1;
      f.style.cssText = 'position:fixed;left:-10px;top:-10px;width:1px;height:1px;border:0;opacity:0;pointer-events:none';
      let done = false;
      const t = setTimeout(() => { if (!done) { done = true; rej(new Error('Runner frame start nahi hua')); } }, 8000);
      RN.onFrame = () => { if (!done) { done = true; clearTimeout(t); res(f); } };
      RN.frame = f;
      f.srcdoc = rnHtml(js);
      document.body.appendChild(f);
    });
  })();
  RN.fp.catch(() => { RN.fp = null; });
  return RN.fp;
}
const rnPost = (m, tr) => RN.frame && RN.frame.contentWindow && RN.frame.contentWindow.postMessage(m, '*', tr || []);
if (window.addEventListener) window.addEventListener('message', e => {
  if (!RN.frame || e.source !== RN.frame.contentWindow) return;
  const d = e.data || {};
  if (d.t === 'frame-ready') { if (RN.onFrame) RN.onFrame(); }
  else if (d.t === 'ready') { const b = RN.boot[d.lang]; if (b) { delete RN.boot[d.lang]; b.res(); } }
  else if (d.t === 'ierr' || d.t === 'werr' || d.t === 'ferr') {
    const b = RN.boot[d.lang];
    if (b) { delete RN.boot[d.lang]; b.rej(new Error(d.err || 'worker error')); }
    else RN.err = d.err || '';
  } else if (d.t === 'res') { const p = RN.pend[d.id]; if (p) { delete RN.pend[d.id]; p.res(d); } }
  else if (d.t === 'net') rnNet(d);
});
async function rnBoot1(lang) {
  if (RN.ready[lang]) return RN.ready[lang];
  const p = (async () => {
    await rnFrame();
    const worker = await rnAsset('runner/worker.js', true);
    const files = {}, tr = [];
    const A = RN_ASSETS[lang] || {};
    for (const k of Object.keys(A)) {
      const isTxt = /\.(js|mjs)$/.test(A[k]);
      const v = await rnAsset(A[k], isTxt);
      files[k] = isTxt ? v : v.slice(0);
      if (!isTxt) tr.push(files[k]);
    }
    await new Promise((res, rej) => {
      const t = setTimeout(() => { delete RN.boot[lang]; rej(new Error('Runtime ' + lang + ' 20 sec me ready nahi hua')); }, 20000);
      RN.boot[lang] = { res: () => { clearTimeout(t); res(); }, rej: e => { clearTimeout(t); rej(e); } };
      rnPost({ t: 'init', lang, worker, files }, tr);
    });
  })();
  RN.ready[lang] = p;
  p.catch(() => { if (RN.ready[lang] === p) delete RN.ready[lang]; });
  return p;
}
async function rnBoot(lang) {
  try { return await rnBoot1(lang); }
  catch (e) {
    // some WebViews refuse a blob worker in a sandbox without an origin: retry once with the app origin (the CSP still blocks the network)
    if (!RN.fb && RN.sbx === 'allow-scripts') { RN.fb = true; RN.sbx = 'allow-scripts allow-same-origin'; rnReset(); return await rnBoot1(lang); }
    throw e;
  }
}
function rnKill(lang) {
  delete RN.ready[lang];
  rnPost({ t: 'kill', lang });
  setTimeout(() => { if (rnOn()) rnBoot(lang).catch(() => {}); }, 300);
}
function rnRun1(lang, code, o) {
  return (async () => {
    await rnBoot(lang);
    const tmo = o.tmo || 10, id = ++RN.seq;
    return new Promise(res => {
      const to = setTimeout(() => {
        delete RN.pend[id];
        rnKill(lang);
        res({ ok: false, timeout: true, out: '', err: 'Time limit (' + tmo + ' s) khatam hui, code roka gaya.' });
      }, tmo * 1000);
      RN.pend[id] = { res: r => { clearTimeout(to); res(r); } };
      const m = { t: 'run', lang, id, code, max: o.max, tables: o.tables, db: o.db };
      rnPost(m, o.db instanceof ArrayBuffer ? [o.db] : []);
    });
  })();
}
function rnRun(lang, code, o) {
  const prev = RN.q[lang] || Promise.resolve();
  const p = prev.then(() => rnRun1(lang, code, o || {}));
  RN.q[lang] = p.catch(() => {});
  return p;
}
// start the runtimes quietly after the app opens, so the first run_code does not wait for them
async function rnWarm() {
  if (typeof Worker === 'undefined' || !rnOn() || (S.rn && S.rn.warm === false)) return;
  for (const l of RN_LANGS) { try { await rnBoot(l); } catch (e) {} await sleep(400); }
}
setTimeout(() => { rnWarm().catch(() => {}); }, 5000);

// ---------- js fetch door ----------
const rnClean = h => String(h || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^\*\./, '').replace(/[\/:?#].*$/, '');
function rnHostOk(host, list) {
  host = String(host || '').toLowerCase();
  if (!host || host.indexOf('.') < 0 || /^[\d.]+$/.test(host) || host.indexOf(':') >= 0 || host === 'localhost' || /\.(local|internal|lan)$/.test(host)) return false;
  return (list || []).map(rnClean).filter(Boolean).some(e => host === e || host.endsWith('.' + e));
}
// Capacitor's fetch returns r.url = the app's own origin (https://localhost/), never the real final URL. That value says nothing about a redirect, so it is ignored.
const rnSelf = h => { h = String(h || '').toLowerCase(); return !h || h === 'localhost' || (typeof location !== 'undefined' && location && h === String(location.hostname || '').toLowerCase()); };
const rnUa = () => 'ChamanNAP/' + (typeof APP_VER !== 'undefined' ? APP_VER : '1') + ' (+https://github.com/CHAMANRK)';
async function rnNet(d) {
  const reply = o => rnPost(Object.assign({ t: 'net-res', lang: d.lang, id: d.id }, o));
  try {
    let u;
    try { u = new URL(String(d.url)); } catch (e) { return reply({ err: 'URL sahi nahi hai.' }); }
    const list = (S.rn && S.rn.net) || [];
    if (u.protocol !== 'https:') return reply({ err: 'Sirf https allowed hai.' });
    if (!rnHostOk(u.hostname, list)) return reply({ err: 'Ye site allowed nahi hai: ' + u.hostname + '. Najeef Settings > Code runner me add kare.' });
    const method = d.method === 'POST' ? 'POST' : 'GET';
    const body = method === 'POST' && typeof d.body === 'string' ? d.body.slice(0, 20000) : undefined;
    const r = await Promise.race([fetch(u.href, { method, headers: Object.assign({ 'User-Agent': rnUa() }, d.headers || {}), body }), sleep(15000).then(() => { throw new Error('15 sec me jawab nahi aaya'); })]);
    if (r.url) { try { const fh = new URL(r.url).hostname; if (!rnSelf(fh) && !rnHostOk(fh, list)) return reply({ err: 'Site ne kisi doosri jagah bhej diya (redirect), roka gaya.' }); } catch (e) {} }
    const text = String(await r.text()).slice(0, 300000);
    reply({ status: r.status, text });
  } catch (e) { reply({ err: errMsg(e) }); }
}

// one real GET for js_site_check test:true. Only called for hosts that passed rnHostOk. The body is never read or returned.
async function rnProbe(u) {
  const t0 = Date.now();
  try {
    const r = await Promise.race([fetch(u.href, { method: 'GET', headers: { 'User-Agent': rnUa() } }), sleep(10000).then(() => { throw new Error('10 sec me jawab nahi aaya'); })]);
    let fin = '';
    if (r.url) { try { fin = new URL(r.url).hostname.toLowerCase(); } catch (e) {} }
    if (rnSelf(fin)) fin = '';
    let ct = '';
    try { ct = (r.headers && r.headers.get && r.headers.get('content-type')) || ''; } catch (e) {}
    return { status: r.status, fin, ct: String(ct).split(';')[0], ms: Date.now() - t0 };
  } catch (e) { return { err: errMsg(e) }; }
}
// js_site_check: tells the AI which sites js fetch may reach (no network call, same rnHostOk check as rnNet)
function rnSiteList() { return Array.from(new Set(((S.rn && S.rn.net) || []).map(rnClean).filter(Boolean))); }
async function siteCheckTool(a, note, fl) {
  const bad = s => { fl.bad = true; return note(s); };
  if (!rnOn()) return bad('Code runner band hai') + ' Najeef ne Settings > Code runner me off kiya hai, js fetch nahi chalega.';
  const list = rnSiteList();
  const raw = String((a && a.host) == null ? '' : a.host).trim();
  const rule = 'Rules: https only; a listed site also allows its subdomains; IP, localhost and .local are never allowed; a redirect to a site that is not listed is blocked.';
  if (!raw) {
    note('js_site_check: ' + list.length + ' allowed');
    return list.length
      ? 'ALLOWED for js fetch (' + list.length + '):\n' + list.join('\n') + '\n' + rule + '\nAnything not in this list is NOT added. To check one site, call js_site_check with host. If you need one that is missing, ask Najeef to add it in Settings > Code runner.'
      : 'No site is allowed right now, so js fetch cannot reach any site. ' + rule + ' Ask Najeef to add the site he wants in Settings > Code runner.';
  }
  let u;
  try { u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : 'https://' + raw); } catch (e) { return bad('host sahi nahi hai: ' + raw.slice(0, 60)); }
  const host = u.hostname.toLowerCase();
  if (u.protocol !== 'https:') { note('js_site_check: ' + host + ' no (not https)'); return host + ': NOT usable. js fetch accepts https only (this was ' + u.protocol.replace(':', '') + ').'; }
  if (rnHostOk(host, list)) {
    const via = list.map(rnClean).find(e => host === e || host.endsWith('.' + e));
    const head = host + ': ALLOWED' + (via && via !== host ? ' (through ' + via + ')' : '') + '.';
    if (!a.test) {
      note('js_site_check: ' + host + ' yes');
      return head + ' If the site redirects to another site that is not listed, the answer is blocked. Add test:true for one real GET.';
    }
    const pr = await rnProbe(u);
    if (pr.err) { note('js_site_check: ' + host + ' test fail'); fl.bad = true; return head + ' Test GET failed: ' + pr.err; }
    const moved = pr.fin && pr.fin !== host;
    const finOk = moved && rnHostOk(pr.fin, list);
    let v = 'Test GET ' + u.href.slice(0, 80) + ' -> ' + pr.status + ' (' + pr.ms + ' ms' + (pr.ct ? ', ' + pr.ct : '') + ').';
    if (moved) v += ' REDIRECTED to ' + pr.fin + (finOk ? ' (that site is also allowed, so it works).' : ' (not allowed: fetch will block the answer, do not use this site).');
    else if (!pr.fin) v += ' The final site is not known, so a redirect cannot be ruled out.';
    else v += ' No redirect to another site.';
    if (pr.status >= 400) v += ' The site refused or the path is wrong (a bare site name tests only its front page; 404 there can be normal). It may also need a key or a User-Agent.';
    note('js_site_check: ' + host + ' test ' + pr.status + (moved ? ' redirect' : ''));
    return head + ' ' + v;
  }
  const never = !host || host.indexOf('.') < 0 || /^[\d.]+$/.test(host) || host.indexOf(':') >= 0 || host === 'localhost' || /\.(local|internal|lan)$/.test(host);
  note('js_site_check: ' + host + ' no');
  return host + ': NOT added' + (never ? ' (IP, localhost and .local names can never be added)' : '') + '. js fetch to it will fail.' + (never ? '' : ' Tell Najeef the exact site name; he can add it in Settings > Code runner.');
}

// ---------- sql inputs (CSV files and db files from the workspace) ----------
function rnCsvParse(txt) {
  txt = String(txt).replace(/^\uFEFF/, '');
  const nl = txt.indexOf('\n'), first = txt.slice(0, nl > 0 ? nl : txt.length);
  const cnt = c => first.split(c).length - 1;
  let d = ',';
  [';', '\t', '|'].forEach(c => { if (cnt(c) > cnt(d)) d = c; });
  const rows = [];
  let row = [], f = '', q = false, i = 0;
  const n = txt.length;
  while (i < n) {
    const c = txt.charAt(i);
    if (q) {
      if (c === '"') { if (txt.charAt(i + 1) === '"') { f += '"'; i += 2; continue; } q = false; i++; continue; }
      f += c; i++; continue;
    }
    if (c === '"' && f === '') { q = true; i++; continue; }
    if (c === d) { row.push(f); f = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; i++; continue; }
    f += c; i++;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows.filter(r => !(r.length === 1 && r[0] === ''));
}
function rnCsvTable(txt, rel, used) {
  const rows = rnCsvParse(txt);
  if (!rows.length) throw new Error('CSV khali hai: ' + rel);
  const seen = {};
  const cols = rows[0].map((h, i) => {
    let c = String(h).trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'col' + (i + 1);
    if (/^\d/.test(c)) c = 'c_' + c;
    let k = c, j = 2;
    while (seen[k]) k = c + '_' + (j++);
    seen[k] = 1;
    return k;
  });
  const body = rows.slice(1);
  if (body.length > 200000) throw new Error('CSV me 2 lakh se zyada rows hain: ' + rel);
  const nc = cols.length, INT = /^-?\d{1,15}$/, NUM = /^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
  const isInt = cols.map(() => true), isNum = cols.map(() => true), has = cols.map(() => false);
  body.forEach(r => {
    for (let c = 0; c < nc; c++) {
      const v = r[c];
      if (v === undefined || v === '') continue;
      has[c] = true;
      if (isInt[c] && !INT.test(v)) isInt[c] = false;
      if (isNum[c] && !NUM.test(v)) isNum[c] = false;
    }
  });
  const types = cols.map((_, c) => !has[c] ? 'TEXT' : isInt[c] ? 'INTEGER' : isNum[c] ? 'REAL' : 'TEXT');
  const data = body.map(r => cols.map((_, c) => {
    const v = r[c];
    if (v === undefined) return null;
    if (types[c] === 'TEXT') return v;
    return v === '' ? null : Number(v);
  }));
  let name = (String(rel).split('/').pop().replace(/\.[^.]*$/, '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '')) || 'data';
  if (/^\d/.test(name)) name = 't_' + name;
  let nm = name, j = 2;
  while (used[nm]) nm = name + '_' + (j++);
  used[nm] = 1;
  return { name: nm, cols, types, rows: data };
}
function rnB64(b64) {
  const bin = atob(b64), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u.buffer;
}
async function rnSqlIn(a) {
  const tables = [], used = {};
  let db = null, dbName = '';
  const csv = Array.isArray(a.csv) ? a.csv : a.csv ? [a.csv] : [];
  for (const raw of csv.slice(0, 6)) {
    const p = fpath(raw);
    if (!p) throw new Error('csv path /sdcard/Chaman ke andar ka hona chahiye: ' + cut(raw, 80));
    if (fNotes(p)) throw new Error(NOTES_MSG);
    const r = await NF('read', { path: p, start: 1, max: 5000000, maxBytes: 2000000 });
    if (r.truncated) throw new Error('CSV 2 MB se badi hai: ' + fRel(p) + '. Pehle chhota hissa banao.');
    tables.push(rnCsvTable(r.text, fRel(p), used));
  }
  if (a.db) {
    const p = fpath(a.db);
    if (!p) throw new Error('db path /sdcard/Chaman ke andar ka hona chahiye.');
    if (fNotes(p)) throw new Error(NOTES_MSG);
    const r = await NF('readB64', { path: p });
    db = rnB64(r.b64);
    dbName = fRel(p);
  }
  return { tables, db, dbName };
}

// ---------- the tool ----------
function rnSay(lang, code, shown, ok) {
  H.push({ role: 'assistant', by: 'Code', local: 1, term: { lang: lang, code: cut(code, 1200), out: cut(shown, 1200) || '(no output)', state: ok ? 'ok' : 'fail' }, content: '```' + lang + '\n' + noFence(cut(code, 1200)) + '\n```\n```\n' + noFence(cut(shown, 1200) || '(no output)') + '\n```', aiNote: 'run_code ' + lang + ' (' + code.length + ' chars): ' + (ok ? 'ok' : 'fail') + '. Code aur output Najeef ko chat me dikha diya.' });
  liveRender();
}
async function codeTool(name, a, note, fl) {
  const bad = s => { fl.bad = true; return note(s); };
  if (!rnOn()) return bad('Code runner band hai') + ' Najeef ne Settings > Code runner me off kiya hai.';
  let lang = String(a.lang || '').toLowerCase().trim();
  lang = { javascript: 'js', node: 'js', python: 'py', micropython: 'py', sqlite: 'sql' }[lang] || lang;
  if (RN_LANGS.indexOf(lang) < 0) return bad('lang galat hai') + ' js, sql ya py chahiye.';
  const code = String(a.code == null ? '' : a.code);
  if (!code.trim()) return bad('code khali hai');
  if (code.length > 60000) return bad('code bahut bada hai') + ' 60000 chars se chhota rakho.';
  const tmo = Math.min(30, Math.max(1, Math.round(+a.timeout_s || 10)));
  let inp = { tables: [], db: null, dbName: '' }, head = '';
  if (lang === 'sql') {
    try { inp = await rnSqlIn(a); }
    catch (e) {
      if (e && e.code === 'NO_ACCESS' && !FILES_HINTED) { FILES_HINTED = true; NF('requestAccess').catch(() => {}); }
      return bad('Input file fail') + ' ' + errMsg(e);
    }
    head = inp.tables.map(t => 'table ' + t.name + '(' + t.cols.map((c, i) => c + ' ' + t.types[i]).join(', ') + ') ' + t.rows.length + ' rows').join('\n');
    if (inp.dbName) head += (head ? '\n' : '') + 'db ' + inp.dbName + ' opened in memory (changes are not saved)';
  } else if (a.csv || a.db) return bad('csv/db sirf sql ke liye hain');
  let r;
  try { r = await rnRun(lang, code, { tmo, max: a.max_rows, tables: inp.tables, db: inp.db }); }
  catch (e) { return bad('Runner start nahi hua') + ' ' + errMsg(e) + ' Najeef Settings > Code runner > Runner test chalaye.'; }
  logAdd('code', lang + ' ' + (r.ok ? 'ok' : r.timeout ? 'timeout' : 'error') + ' ' + (r.ms || 0) + ' ms');
  const body = (r.out ? r.out : '') + (r.ok && r.val !== undefined ? (r.out ? '\n' : '') + '=> ' + r.val : '');
  const shown = rnClip(body + (r.err ? (body ? '\n' : '') + r.err : ''));
  rnSay(lang, code, shown, r.ok);
  if (!r.ok) return bad('run_code ' + lang + ': ' + (r.timeout ? 'time limit' : 'error')) + (head ? '\n' + head : '') + '\n' + (shown || '(koi message nahi)');
  return note('run_code ' + lang + ': ok (' + (r.ms || 0) + ' ms)') + (head ? '\n' + head : '') + '\n' + (shown || '(no output)');
}

// ---------- Settings helpers ----------
function rnStatus() {
  if (typeof Worker === 'undefined') return 'Is WebView me Worker nahi hai, runner nahi chalega.';
  const on = Object.keys(RN.ready);
  return 'Runner: ' + (rnOn() ? 'on' : 'off') + '. Ready: ' + (on.length ? on.join(', ') : 'abhi koi nahi (pehle run pe start hoga)') + '.' + (RN.fb ? ' Mode: app-origin sandbox.' : '');
}
async function rnTest() {
  const L = [];
  const t = async (lang, code, want, o) => {
    try {
      const r = await rnRun(lang, code, Object.assign({ tmo: 20 }, o || {}));
      const s = (r.out || '') + (r.val !== undefined ? ' ' + r.val : '') + (r.err || '');
      L.push((s.indexOf(want) >= 0 ? 'OK ' : 'FAIL ') + lang + ' (' + (r.ms || 0) + ' ms)' + (s.indexOf(want) >= 0 ? '' : ': ' + cut(s, 80)));
    } catch (e) { L.push('FAIL ' + lang + ': ' + cut(errMsg(e), 90)); }
  };
  await t('js', '6*7', '42');
  await t('sql', 'select 6*7 as a', '42');
  await t('py', 'print(6*7)', '42');
  await t('js', "let m='LEAK';try{const x=new XMLHttpRequest();x.open('GET','https://example.com/',false);x.send();}catch(e){m='net band'}try{await import('https://example.com/x.js');m='LEAK'}catch(e){} return m", 'net band');
  return L.join('\n');
}

// ---------- rules ----------
function codeRules() {
  return 'CODE RUNNER (run_code {lang, code})\n'
    + '- Three languages run inside the app, no Termux: js (JavaScript, async/await ok), sql (SQLite), py (MicroPython).\n'
    + '- Use it instead of guessing: exact math, percentages, unit or currency maths with the rate he gave, dates and times (js: new Date() is the phone clock), days between dates, counts, sorting, regex tests, JSON and text work, queries on a CSV. Not for plain chat answers.\n'
    + '- js: show results with console.log, or end with a value / return it. Example: Math.ceil((new Date(2026,11,25)-new Date())/864e5). Top-level await works. fetch works only for sites Najeef allowed in Settings (Code runner); other sites fail. Not sure a site is allowed? Call js_site_check first (no host = the allowed list, host = check one site, host + test:true = one real GET that shows the status and any redirect).\n'
    + '- sql: csv:[paths] loads workspace CSV files as tables (the result lists table and column names; types are guessed), db:path opens a SQLite file in memory. Changes are not saved. Quote column names that are SQL words.\n'
    + '- py: MicroPython, not CPython. Has json, math, re, random, time, datetime, collections, itertools, functools, heapq, struct, hashlib, base64, zlib. No numpy, pandas, requests, pip, statistics, decimal, csv, textwrap. Print results (the value of the last line is not shown). For heavy Python use Termux.\n'
    + '- Limits: 10 s (timeout_s up to 30), output 4000 chars, no files, no phone, no screen, no keys. A runner error is not the task result: report it as it is and fix the code once.\n'
    + '- The app already shows the code and the output in the chat, so do not paste them again unless he asks. Say the result in one line.\n'
    + '- Never put keys, passwords or private text into code unless the task needs it.';
}
