// Step13: memory without Termux (native Files): load, read (fuzzy + project list), search, save, rules sync, memory/ confirm gate, autoMem on file tools, new prompt.
const vm=require('vm'),fs=require('fs');
function boot(FS,seedStore,opt){
  opt=opt||{};
  const els={},handlers={};
  const mk=sel=>{const o={value:'',style:{},dataset:{},options:[],classList:{add(){},remove(){},toggle(){}},addEventListener(t,f){const k=sel+':'+t,pv=handlers[k];handlers[k]=pv?async e=>{await pv(e);await f(e)}:f},insertAdjacentHTML(){},querySelector(){return mk('x')},closest(){return null},appendChild(){},remove(){},select(){},click(){},focus(){},set onclick(f){handlers[sel+':click']=f},set onchange(f){handlers[sel+':change']=f},scrollHeight:0,scrollTop:0,disabled:false,textContent:'',srcdoc:''};let h='';Object.defineProperty(o,'innerHTML',{get(){return h},set(v){h=v;if(sel==='#prov')o.options=v.split('<option').slice(1)}});return o};
  const doc={querySelector:s=>els[s]||(els[s]=mk(s)),createElement:()=>mk('c'),body:mk('body'),documentElement:{dataset:{}},addEventListener(){}};
  const store=Object.assign({},seedStore||{});const bodies=[],nt=[],calls=[];let n=0;
  const FILES=require('./files-fake.js')(FS,{log:calls,get noAccess(){return opt.noAccess}});
  const ctx={document:doc,btoa:s=>Buffer.from(s,'binary').toString('base64'),TextDecoder,localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=v}},matchMedia:()=>({matches:true,addEventListener(){}}),navigator:{},console,setTimeout:(f,ms)=>{const t=setTimeout(f,ms>10000?1e9:Math.min(ms,3));if(ms>10000)t.unref();return t},clearTimeout,URL,Image:function(){},
    fetch:async(u,o)=>{bodies.push(JSON.parse(o.body));const s=(opt.script||[])[n++]||'ok';const msg=typeof s==='string'?{role:'assistant',content:s}:{role:'assistant',content:null,tool_calls:s};return{ok:true,status:200,json:async()=>({choices:[{message:msg}]}),text:async()=>''}}};
  ctx.window=ctx;
  ctx.Capacitor={nativePromise:async(pl,m,o)=>{if(pl==='Files'){if(opt.noAccess&&m!=='requestAccess')return Promise.reject(Object.assign(new Error('Chaman ko All files access nahi mili.'),{code:'NO_ACCESS'}));return FILES(m,o)}if(pl==='Termux'){nt.push(m+' '+String(o.command||o.path||'').slice(0,60));return{stdout:'BACKED 1000',exitCode:0}}return{}}};
  vm.createContext(ctx);
  process.chdir(__dirname+'/../www');
  for(const f of ['prompts','core','status','providers','chat','settings','attach','keys','helpers','phone','tools','termux','workspace','files','notes','slash','fast','intents','termuxapi','runner','rules','log','main'])vm.runInContext(fs.readFileSync('js/'+f+'.js','utf8'),ctx,{filename:f+'.js'});
  return{ctx,els,handlers,bodies,nt,calls,store,t:s=>vm.runInContext(s,ctx),setN:v=>{n=v}};
}
let fails=0;const ok=(c,l)=>{console.log((c?'PASS ':'FAIL ')+l);if(!c)fails++};
const M='/sdcard/Chaman/memory/';
const mkFS=()=>({[M+'_index.md']:'# Memory index\n- chaman-update-command - how Najeef updates the Chaman repo\n- carrom-game - carrom web game\n- chaman-notes-app - notes feature of Chaman\n',[M+'general.md']:'# general\n- Najeef likes short Hinglish answers\n',[M+'chaman-update-command.md']:'# chaman-update-command\n- 2026-10-20 10:00: git add . && git commit -m "Render feature" && git push is the update flow\n',[M+'carrom-game.md']:'# carrom-game\n- 2026-10-21 09:00: striker physics done, pockets baaki\n',[M+'chaman-notes-app.md']:'# chaman-notes-app\n- 2026-10-27 12:00: notes use slash list\n',[M+'rules/files.md']:'# rules/files\nstriker rules copy should not be searched\n'});
const run=async(b,tool,args)=>{const steps=[];const res=await b.t('execTool')(tool,args,steps);return{res:String(res),steps}};
(async()=>{
 const FS=mkFS();let b=boot(FS);
 b.t("S.keys.groq='k';S.prov='groq';");
 // load into prompt, no Termux
 const mem=await b.t('wsLoadMem()');
 ok(mem.includes('carrom-game')&&mem.includes('--- general ---')&&mem.includes('short Hinglish'),'wsLoadMem loads index + general from Files');
 await new Promise(r=>setTimeout(r,30));
 ok(b.nt.length===0,'no Termux call for memory load / rules sync (nt='+b.nt.length+')');
 ok(Object.keys(FS).filter(k=>k.includes('/memory/rules/')).length>=9&&FS[M+'_index.md'].includes('- rules/ -'),'rules copy written through Files + index line');
 // read
 let r=await run(b,'memory_read',{});ok(r.res.includes('chaman-update-command')&&r.res.includes('general'),'memory_read (no project) gives index + general');
 r=await run(b,'memory_read',{project:'carrom-game'});ok(r.res.includes('striker physics'),'memory_read exact project');
 r=await run(b,'memory_read',{project:'update-command'});ok(r.res.includes('git add .')&&/close project/.test(r.res),'fuzzy: "update-command" -> chaman-update-command');
 r=await run(b,'memory_read',{project:'jailer'});ok(/NOFILE/.test(r.res)&&r.res.includes('carrom-game')&&/Khud kuch banake mat/.test(r.res),'missing project: list of real projects, tells AI not to invent');
 r=await run(b,'memory_read',{project:'chaman'});ok(/NOFILE/.test(r.res)&&/close naam/.test(r.res),'ambiguous "chaman": candidates listed ('+r.res.slice(0,120)+')');
 // search
 r=await run(b,'memory_search',{query:'render feature'});ok(r.res.includes('chaman-update-command.md')&&r.res.includes('Render feature'),'memory_search finds words across projects');
 r=await run(b,'memory_search',{query:'striker'});ok(r.res.includes('carrom-game.md')&&!r.res.includes('rules/'),'memory_search skips the rules copy');
 r=await run(b,'memory_search',{query:'zzzqqq'});ok(/nahi mila/.test(r.res)&&/note_get/.test(r.res),'no hit: says so and points to note_get');
 // save
 r=await run(b,'memory_save',{project:'new-proj',note:'index.html banayi, header fix baaki hai'});ok(/desc chahiye/.test(r.res)&&r.res.includes('carrom-game')&&!FS[M+'new-proj.md'],'new project without desc: refused + existing names shown');
 r=await run(b,'memory_save',{project:'new-proj',note:'index.html banayi, header fix baaki hai',desc:'small test web app'});
 ok(FS[M+'new-proj.md']&&/^# new-proj\n- \d{4}-\d\d-\d\d \d\d:\d\d: index\.html banayi/.test(FS[M+'new-proj.md'])&&FS[M+'_index.md'].includes('- new-proj - small test web app'),'new project created with header, dated line and index entry');
 r=await run(b,'memory_save',{project:'new-proj',note:'footer bhi theek kiya, ab deploy baaki hai'});ok((FS[M+'new-proj.md'].match(/\n- /g)||[]).length===2&&(FS[M+'_index.md'].match(/new-proj/g)||[]).length===1,'existing project: appended, index not duplicated');
 r=await run(b,'memory_save',{project:'x',note:'info saved here',desc:'d'});ok(/asli content nahi/.test(r.res),'weak note rejected');
 r=await run(b,'memory_save',{project:'_index',note:'overwrite the index with garbage please'});ok(!/Memory save:/.test(r.res)&&FS[M+'_index.md'].startsWith('# Memory index'),'project name _index is refused');
 const bk=b.calls.filter(c=>c.startsWith('write ')&&c.includes('new-proj.md')).length;ok(bk===1,'memory_save never overwrites (one create write, rest appends)');
 // memory/ is gated for direct file tool writes
 const pend=async(btn)=>{for(let i=0;i<300;i++){await new Promise(r=>setTimeout(r,5));const H=b.t('H'),ix=H.findIndex(m=>m.confirm&&m.confirm.state==='pending');if(ix>=0){const head=H[ix].content.split('\n')[0];await b.handlers['#chat:click']({target:{closest:q=>q==='.abtn'?{dataset:{m:String(ix),o:btn}}:null}});return head}}return'NO CARD'};
 let p=run(b,'file_write',{path:'memory/carrom-game.md',content:'# carrom-game\nrewritten'});let head=await pend('x');r=await p;
 ok(/memory\/ me seedha likhna/.test(head)&&/cancel/.test(r.res)&&FS[M+'carrom-game.md'].includes('striker physics'),'file_write in memory/: confirm card, Cancel keeps the file');
 p=run(b,'file_write',{path:'memory/carrom-game.md',content:'# carrom-game\n- consolidated notes'});head=await pend('0');r=await p;
 ok(FS[M+'carrom-game.md']==='# carrom-game\n- consolidated notes','file_write in memory/: Allow writes');
 p=run(b,'edit_file',{path:'memory/general.md',old:'short Hinglish',new:'long English'});head=await pend('x');r=await p;
 ok(/badalna/.test(head)&&FS[M+'general.md'].includes('short Hinglish'),'edit_file in memory/: confirm card, Cancel keeps it');
 FS['/sdcard/Chaman/work/a/x.txt']='hello';r=await run(b,'edit_file',{path:'work/a/x.txt',old:'hello',new:'hi'});ok(FS['/sdcard/Chaman/work/a/x.txt']==='hi','files outside memory/ are unaffected (no card)');
 // Termux write to memory/ also needs a card
 p=run(b,'termux_write_file',{path:'/sdcard/Chaman/memory/general.md',content:'# general\nx'});head=await pend('x');r=await p;ok(/File likhne se pehle confirm/.test(head),'termux_write_file to memory/ shows a confirm card');
 // no access
 const bn=boot(mkFS(),null,{noAccess:true});bn.t("S.keys.groq='k';S.prov='groq';");
 ok((await bn.t('wsLoadMem()'))==='','no access: memory load is silent');
 r=await run(bn,'memory_save',{project:'carrom-game',note:'striker physics theek kiya aaj'});ok(/All files access/.test(r.res),'no access: memory_save explains the permission');
 // autoMem fires after file_write
 const sc=[[{id:'1',type:'function',function:{name:'file_write',arguments:JSON.stringify({path:'work/z/a.txt',content:'abc'})}}],'Ho gaya.',[{id:'2',type:'function',function:{name:'memory_save',arguments:JSON.stringify({project:'zproj',note:'work/z/a.txt banayi, abc likha, aage deploy baaki',desc:'z test project'})}}]];
 const ba=boot(mkFS(),null,{script:sc});ba.t("S.keys.groq='k';S.prov='groq';");ba.els['#in'].value='ek file banao';await ba.handlers['#f:submit']({preventDefault(){}});
 ok(ba.bodies.length===3&&(ba.bodies[2].tools||[]).length===1&&ba.bodies[2].tools[0].function.name==='memory_save','autoMem hidden call runs after file_write (tools: memory_save only)');
 // prompt
 const D=b.t('DEF_SYS');
 ok(D.includes('NAJEEF AND YOU')&&D.includes('developer and controller')&&/not given you yet|has not given you yet/.test(D)&&D.includes('ye feature abhi nahi aaya'),'DEF_SYS: Najeef is the developer/controller, missing = not given yet, forbidden phrases named');
 ok(/Ye abhi aapne mujhe diya nahi hai/.test(D),'DEF_SYS: Hinglish template for "not given yet"');
 ok(b.t('skillText()').includes('Not given to you yet')&&b.t('skillText()').includes('Shizuku (silent system toggles')&&b.t('skillText()').includes('device_api('),'skill lists what each missing piece would add');
 ok(b.t('RULES.memory').includes('memory_search')&&!/needs Termux/.test(b.t('RULES.memory').split('\n')[0]),'memory rules updated (no Termux, memory_search)');
 // migration: a phone that still has the old default gets the new one
 const old=b.t('PREV15_SYS');const bm=boot(mkFS(),{nap_s:JSON.stringify({system:old})});
 ok(bm.t('S.system===DEF_SYS'),'old default prompt (PREV15) migrates to the new one');
 const bc=boot(mkFS(),{nap_s:JSON.stringify({system:'my custom prompt'})});ok(bc.t("S.system")==='my custom prompt','custom prompt is left alone');
 console.log(fails?'\n'+fails+' FAILED':'\nALL PASS');process.exit(fails?1:0);
})().catch(e=>{console.error('ERR',e);process.exit(1)});
