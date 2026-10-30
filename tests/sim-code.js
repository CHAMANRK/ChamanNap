// Step15: auto Save/toggle through Accessibility (open_intent press/set, set_switch) and Termux:API (device_api, api_check).
const vm=require('vm'),fs=require('fs');
const els={},handlers={};
const mk=sel=>{const o={value:'',style:{},dataset:{},options:[],classList:{add(){},remove(){},toggle(){}},addEventListener(t,f){const k=sel+':'+t,pv=handlers[k];handlers[k]=pv?async e=>{await pv(e);await f(e)}:f},insertAdjacentHTML(){},querySelector(){return mk('x')},closest(){return null},appendChild(){},remove(){},select(){},click(){},focus(){},set onclick(f){handlers[sel+':click']=f},set onchange(f){handlers[sel+':change']=f},scrollHeight:0,scrollTop:0,disabled:false,textContent:'',srcdoc:''};let h='';Object.defineProperty(o,'innerHTML',{get(){return h},set(v){h=v}});return o};
const doc={querySelector:s=>els[s]||(els[s]=mk(s)),createElement:()=>mk('c'),body:mk('body'),documentElement:{dataset:{}},addEventListener(){}};
const store={},sent=[],pills=[];let failWith=null,failPkgOnly=false;
const ctx={document:doc,localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=v}},matchMedia:()=>({matches:true,addEventListener(){}}),navigator:{},console,setTimeout:(f,ms)=>ms>=100000?0:setTimeout(f,Math.min(ms,3)),clearTimeout,URL,Image:function(){},fetch:async()=>({ok:true,status:200,json:async()=>({choices:[{message:{role:'assistant',content:'ok'}}]}),text:async()=>''})};
ctx.window=ctx;
let screen=[],clicks=[],runs=[],runRes=null,flip=true,pkg='com.android.settings';
ctx.Capacitor={nativePromise:async(pl,m,o)=>{
  if(pl==='Intents'){sent.push(o);return{ok:true}}
  if(pl==='ScreenControl'){
    if(m==='pill'){pills.push(o);return{ok:true}}
    if(m==='activity')return{};
    if(m==='read')return{pkg,items:screen.map(x=>Object.assign({},x))};
    if(m==='click'){clicks.push(o.id);const it=screen.find(x=>x.i===o.id);if(it&&flip&&/Switch|Toggle/.test(it.k)){const on=(it.f||'').indexOf('x')>=0;it.f=on?(it.f||'').replace('x',''):(it.f||'')+'x'}if(it&&it.dismiss)screen=[];return{ok:true,label:it&&it.t}}
    return{ok:true}}
  if(pl==='Termux'&&m==='run'){runs.push(o);return typeof runRes==='function'?runRes(o):runRes||{exitCode:0,stdout:'',stderr:''}}
  return{}}};
vm.createContext(ctx);
process.chdir(__dirname+'/../www');
for(const f of ['prompts','core','providers','chat','settings','attach','keys','helpers','phone','tools','termux','workspace','files','notes','slash','fast','intents','termuxapi','runner','rules','log','main'])vm.runInContext(fs.readFileSync('js/'+f+'.js','utf8'),ctx,{filename:f+'.js'});
const t=s=>vm.runInContext(s,ctx);
let fails=0;const ok=(c,l)=>{console.log((c?'PASS ':'FAIL ')+l);if(!c)fails++};
const run=async(name,a)=>{const steps=[];const res=await t('execTool')(name,a,steps);return{res:String(res),steps}};
const sw=(i,t_,on)=>({i,k:'Switch',t:t_,f:'c'+(on?'x':'')});
const FS={};const flog=[];
ctx.Capacitor={nativePromise:async(pl,m,o)=>{
  if(pl==='Files')return require('./files-fake.js')(FS,{log:flog})(m,o);
  return{};}};
const R='/sdcard/Chaman';
FS[R+'/work/sales.csv']='Name,Qty,Price,Note\nA,2,10.5,"hello, world"\nB,3,4,\n"C ""q""",,7,x\n';
FS[R+'/work/semi.csv']='id;val\n1;5\n2;6\n';
FS[R+'/notes/secret.csv']='a,b\n1,2\n';
const setReply=r=>{ctx.__reply=r};
t('rnRun=async(lang,code,o)=>{globalThis.__sent={lang,code,o};return typeof globalThis.__reply==="function"?globalThis.__reply(lang,code,o):globalThis.__reply}');
(async()=>{
  // csv parser + types
  const tb=t('rnCsvTable')(FS[R+'/work/sales.csv'],'work/sales.csv',{});
  ok(tb.name==='sales'&&tb.cols.join()==='name,qty,price,note','csv: table name and columns');
  ok(tb.types.join()==='TEXT,INTEGER,REAL,TEXT','csv: types guessed (qty int, price real) -> '+tb.types.join());
  ok(tb.rows.length===3&&tb.rows[0][3]==='hello, world'&&tb.rows[2][0]==='C "q"'&&tb.rows[2][1]===null,'csv: quotes, commas, empty numeric -> null');
  const tb2=t('rnCsvTable')(FS[R+'/work/semi.csv'],'work/semi.csv',{});
  ok(tb2.cols.join()==='id,val'&&tb2.rows[1][1]===6,'csv: semicolon delimiter detected');
  const dup=t('rnCsvTable')('A b,A-b,1x\n1,2,3\n','x/data file.csv',{});
  ok(dup.cols.join()==='a_b,a_b_2,c_1x'&&dup.name==='data_file','csv: column names cleaned, duplicates numbered, name from file');

  // sql tool: loads csv, shows schema, returns output
  setReply({ok:true,out:'a | b\n--- | ---\n1 | 2\n(1 row)',err:'',ms:7});
  let r=await run('run_code',{lang:'sql',code:'select 1',csv:['work/sales.csv','/sdcard/Chaman/work/semi.csv']});
  ok(/table sales\(name TEXT, qty INTEGER, price REAL, note TEXT\) 3 rows/.test(r.res)&&/table semi\(id INTEGER, val INTEGER\) 2 rows/.test(r.res),'sql: schema lines in result');
  ok(ctx.__sent.o.tables.length===2&&ctx.__sent.o.tmo===10,'sql: tables passed to runner, default 10 s');
  ok(/1 \| 2/.test(r.res)&&/ok \(7 ms\)/.test(r.res),'sql: output returned');
  ok(t('H').some(m=>m.by==='Code'&&/```sql/.test(m.content)&&/\[app log\]/.test(t('aiText')(m))),'chat shows code + output; AI sees only an app-log line');

  r=await run('run_code',{lang:'sql',code:'select 1',csv:['notes/secret.csv']});
  ok(/notes\/ Najeef/.test(r.res),'sql: notes/ csv refused');
  r=await run('run_code',{lang:'sql',code:'select 1',csv:['/etc/passwd']});
  ok(/andar ka hona/.test(r.res),'sql: path outside workspace refused');
  r=await run('run_code',{lang:'sql',code:'select 1',csv:['work/none.csv']});
  ok(/File nahi mili/.test(r.res),'sql: missing csv reported -> '+r.res.slice(0,80));
  r=await run('run_code',{lang:'js',code:'1',csv:['work/sales.csv']});
  ok(/sirf sql/.test(r.res),'csv with js refused');

  // js ok with value, error, timeout, limits, aliases
  setReply({ok:true,out:'hi',val:'42',err:'',ms:3});
  r=await run('run_code',{lang:'javascript',code:'6*7',timeout_s:99});
  ok(/hi\n=> 42/.test(r.res)&&ctx.__sent.lang==='js'&&ctx.__sent.o.tmo===30,'js: output + value, alias javascript, timeout capped at 30');
  setReply({ok:false,out:'x',err:'ReferenceError: q is not defined',ms:2});
  r=await run('run_code',{lang:'js',code:'q'});
  ok(/error/.test(r.res)&&/ReferenceError/.test(r.res)&&r.steps.some(s=>/error/.test(s)),'js: error reported as failure');
  setReply({ok:false,timeout:true,out:'',err:'Time limit (10 s) khatam hui, code roka gaya.'});
  r=await run('run_code',{lang:'py',code:'while 1: pass'});
  ok(/time limit/i.test(r.res),'timeout reported');
  setReply({ok:true,out:'x'.repeat(9000),err:'',ms:1});
  r=await run('run_code',{lang:'py',code:'print(1)'});
  ok(r.res.length<4400&&/chars cut/.test(r.res),'long output clipped to ~4000 -> '+r.res.length);
  r=await run('run_code',{lang:'ruby',code:'1'});ok(/lang galat/.test(r.res),'unknown language refused');
  r=await run('run_code',{lang:'js',code:'  '});ok(/khali/.test(r.res),'empty code refused');
  ctx.rnRunOrig=null;
  t('S.rn={on:false}');
  r=await run('run_code',{lang:'js',code:'1'});ok(/band hai/.test(r.res),'runner off in Settings -> refused');
  t('S.rn={on:true,warm:true,net:["api.github.com"]}');

  // net allowlist
  const hk=t('rnHostOk'),L=['api.github.com','*.Wikipedia.org','https://example.org/path'];
  ok(hk('api.github.com',L)&&hk('en.wikipedia.org',L)&&hk('example.org',L),'allowlist: exact, subdomain, cleaned entries');
  ok(!hk('github.com',L)&&!hk('evilapi.github.com.evil.com',L)&&!hk('notwikipedia.org',L),'allowlist: parent/lookalike hosts refused');
  ok(!hk('192.168.1.1',['192.168.1.1'])&&!hk('localhost',['localhost'])&&!hk('router.local',['router.local']),'allowlist: IPs, localhost, .local never allowed');

  // logging: no code, no output
  const lg=t('logTool')('run_code',{lang:'js',code:'secret=123456789',csv:['a.csv']});
  ok(/run_code js \(16 chars, csv\)/.test(lg)&&lg.indexOf('secret')<0,'log line has length only -> '+lg);
  ok(!/run_code/.test(JSON.stringify(t('LOGQ').filter(x=>/\[tool/.test(x.text)&&/->/.test(x.text)&&/run_code/.test(x.text)))),'log: no tool output stored for run_code');

  // rules + skill
  const sk=t('skillText')();
  ok(/- run_code\(lang, code, csv, db, timeout_s, max_rows\)/.test(sk)&&/small code runs with run_code/.test(sk),'skill lists run_code (auto from tools) and the text');
  ok(/CODE RUNNER/.test(t('ruleText')('code'))&&/MicroPython, not CPython/.test(t('ruleText')('code')),'code rules text');
  ok(t('ruleAreas')('is file ka total nikalo csv').indexOf('code')>=0&&t('ruleAreas')('kal ki date kya hai').indexOf('code')>=0,'code rules auto-added for calculation / date messages');
  const rr=await run('rules_read',{area:'code'});ok(/CODE RUNNER/.test(rr.res),'rules_read code works');
  ok(/run_code/.test(t('DEF_SYS'))&&t('PREV18_SYS')!==t('DEF_SYS')&&!/run_code/.test(t('PREV18_SYS')),'system prompt updated, old one kept for migration');
  t('S.system=PREV18_SYS');
  console.log(fails?('FAILS: '+fails):'ALL OK');process.exit(fails?1:0);
})();
