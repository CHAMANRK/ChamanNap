// Step23.1: custom rules, the simple way (crules.js): plain-text rules, /rule <message> = normal AI turn with the rules added, /rules to manage, rule_save with an Allow card, migration of older rules, persistence.
const vm=require('vm'),fs=require('fs');
const els={},handlers={};
const mk=sel=>{const o={value:'',style:{},dataset:{},options:[],classList:{add(){},remove(){},toggle(){}},addEventListener(t,f){handlers[sel+':'+t]=f},insertAdjacentHTML(){},querySelector(){return mk('x')},closest(){return null},appendChild(){},remove(){},select(){},click(){},set onclick(f){handlers[sel+':click']=f},set onchange(f){},scrollHeight:0,scrollTop:0,disabled:false,textContent:''};let h='';Object.defineProperty(o,'innerHTML',{get(){return h},set(v){h=v;if(sel==='#prov')o.options=v.split('<option').slice(1)}});return o};
const doc={querySelector:s=>els[s]||(els[s]=mk(s)),createElement:()=>mk('c'),body:mk('body'),documentElement:{dataset:{}}};
const store={};let n=0;const log=[];
const tc=(id,name,args)=>({id,type:'function',function:{name,arguments:JSON.stringify(args)}});
let mode='text',script=[],fetches=[];const nat=[];let openDelay=150;
els['#send']=mk('#send');els['#send'].innerHTML='<svg>SEND</svg>';
const ctx={document:doc,localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=v}},matchMedia:()=>({matches:true,addEventListener(){}}),navigator:{},console,setTimeout:(f,ms)=>setTimeout(f,ms>=30000?ms:Math.min(ms,3)),clearTimeout,URL,Image:function(){},
 AbortController,
 fetch:(url,init)=>new Promise((res,rej)=>{
  fetches.push(init||{});
  const sig=init&&init.signal;
  if(sig)sig.addEventListener('abort',()=>rej(Object.assign(new Error('aborted'),{name:'AbortError'})));
  if(mode==='hang')return;
  const s=script[n++]||'(fertig)';
  const msg=typeof s==='string'?{role:'assistant',content:s}:{role:'assistant',content:null,tool_calls:s};
  res({ok:true,status:200,json:async()=>({choices:[{message:msg}]}),text:async()=>''});
 })};
ctx.window=ctx;
ctx.Capacitor={nativePromise:async(pl,m,o)=>{
 if(m!=='activity'&&m!=='read'&&m!=='reset'&&m!=='pill')nat.push(m);
 if(m==='openApp'){await new Promise(r=>setTimeout(r,openDelay));return{label:'Termux'}}
 if(m==='read')return{pkg:'com.termux',items:[{i:0,k:'TerminalView',t:'$ '}]};
 if(m==='activity')return{count:0,kbd:false,done:false,stop:false};
 return{}}};
const FILES={};
const OLD=[{id:'old1',name:'playlist_add',on:true,triggers:['add this music in playlist','playlist add'],need:['link'],auto:true,uses:2,created:'2026-11-04',steps:[{do:'tool',tool:'termux_run',args:{command:'yt-dlp -x {link}'},as:'dl'},{do:'if',cond:'ok',then:[{do:'reply',text:'save ho gaya'}],else:[{do:'reply',text:'fail'}]}]},{name:'broken',triggers:[],steps:[]}];
store.nap_rules=JSON.stringify(OLD);   // rules saved by v1.30000.0: must be turned into plain text when the app starts
const NATC=[];
ctx.Capacitor={nativePromise:async(pl,m,o)=>{
  NATC.push(m);
  if(pl==='Files'){
    if(m==='write'){FILES[o.path]=o.content;return{ok:true}}
    if(m==='read'){if(FILES[o.path]==null)return Promise.reject(Object.assign(new Error('nf'),{code:'NOT_FOUND'}));return{text:FILES[o.path]}}
    return{};
  }
  if(m==='activity')return{count:0,kbd:false,done:false,stop:false};
  return{};
}};
vm.createContext(ctx);
for(const f of ['version','prompts','core','status','providers','chat','settings','attach','keys','helpers','phone','tools','termux','workspace','files','notes','slash','fast','intents','termuxapi','runner','sched','crules','rules','log','main'])vm.runInContext(fs.readFileSync('js/'+f+'.js','utf8'),ctx,{filename:f+'.js'});
let pass=0,fails=0;const ok=(c,m)=>{if(c){pass++;console.log('PASS',m)}else{fails++;console.log('FAIL',m)}};
const run=c=>vm.runInContext(c,ctx),W=ms=>new Promise(r=>setTimeout(r,ms));
const send=async t=>{els['#in'].value=t;return handlers['#f:submit']({preventDefault(){}})};
const sysOf=i=>JSON.parse(fetches[i].body).messages[0].content;
const msgsOf=i=>JSON.parse(fetches[i].body).messages;
const H=()=>run('H'),last=()=>{const h=H();return h[h.length-1]};
const ai=async(replies)=>{n=0;script=replies;fetches.length=0};
els['#in']=els['#in']||{};const pick=()=>{if(!els['#in'].focus)els['#in'].focus=()=>{};run("slashPick('rule')")};
const mkRule=(name,when,steps,on)=>({id:'i'+name,name,on:on!==false,when,steps,created:'',uses:0,last:''});
const setRules=a=>{run('CR='+JSON.stringify(a))};
(async()=>{
 run("S.keys.groq='k';S.prov='groq';");
 // ===== A. rules saved by the older version are turned into plain text at start
 const c0=run('CR');
 ok(c0.length===1&&c0[0].name==='playlist_add'&&c0[0].uses===2&&c0[0].id==='old1','old rule kept (id, uses), the broken one dropped');
 ok(/add this music in playlist/.test(c0[0].when)&&/link hona chahiye/.test(c0[0].when),'old triggers became the "when" text, link need mentioned');
 ok(/1\. termux_run chalao: yt-dlp -x <link>/.test(c0[0].steps)&&/Agar pichla step chal gaya:/.test(c0[0].steps)&&/Warna:/.test(c0[0].steps)&&/save ho gaya/.test(c0[0].steps),'old steps became numbered plain steps with if/else words: '+JSON.stringify(c0[0].steps));
 ok(run("ld('nap_rules',[])")[0].steps===c0[0].steps,'migrated rules are saved back');

 // ===== B. /rule <message>
 setRules([mkRule('playlist_add','Link ke saath bole: isko playlist me add kar.','1. termux_run: yt-dlp -x \'<link>\'\n2. Fail ho to batao.'),mkRule('night','good night bole to','1. 11 baje ka reminder lagao.'),mkRule('old_off','kuch aur','1. x ko karo yaha.',false)]);
 await ai(['normal jawab']);
 await send('isko playlist me add kar https://a.b/c');
 ok(fetches.length===1&&sysOf(0).indexOf('Najeef started this message with /rule')<0,'a normal message does NOT get the custom rules');
 ok(last().role==='assistant'&&/normal jawab/.test(last().content),'normal reply shown');

 await ai(['rule wala jawab']);pick();
 await send('/rule isko playlist me add kar https://a.b/c');
 const s1=sysOf(0);
 ok(/CUSTOM RULES: Najeef started this message with \/rule/.test(s1)&&/RULE 1: playlist_add/.test(s1)&&/RULE 2: night/.test(s1),'/rule message: both enabled rules are in the AI instructions');
 ok(/yt-dlp -x '<link>'/.test(s1)&&/when: Link ke saath bole/.test(s1),'rule text (when + steps) is in the instructions');
 ok(!/old_off/.test(s1)&&s1.indexOf('kuch aur')<0,'a rule that is off is not given');
 ok(/single quotes/.test(s1)&&/no rule matched/.test(s1)&&/ask him for it/.test(s1),'instructions: quote values, say when no rule matched, ask for a missing link');
 const um=msgsOf(0).filter(m=>m.role==='user').pop();
 ok(/\/rule isko playlist me add kar https:\/\/a\.b\/c/.test(typeof um.content==='string'?um.content:JSON.stringify(um.content)),'the AI sees what he typed, with /rule');
 ok(last().role==='assistant'&&/rule wala jawab/.test(last().content)&&!H().find(m=>m.role==='user'&&/\/rule/.test(m.content)).info,'reply shown; his /rule message is a normal user message (not hidden info)');

 await ai(['phir normal']);
 await send('ek aur normal message');
 ok(sysOf(0).indexOf('Najeef started this message with /rule')<0,'the next normal message has no rules again');

 // /rule alone = help, no AI call
 await ai(['x']);pick();
 await send('/rule');
 ok(fetches.length===0&&/\/rule <message>/.test(last().content)&&last().info,'/rule alone shows help and calls no AI');
 // typed by hand without picking it from the list: plain text
 await ai(['plain']);run("SL_ARM=''");
 await send('/rule hello');
 ok(fetches.length===1&&sysOf(0).indexOf('Najeef started this message with /rule')<0,'"/rule" typed by hand (not picked from the list) is plain text, no rules');
 // no rules at all
 setRules([]);await ai(['koi rule nahi']);pick();
 await send('/rule kuch karo');
 ok(/no custom rules/.test(sysOf(0))&&/iska rule bana/.test(sysOf(0)),'/rule with no rules: AI is told, and told how he can make one');
 // all rules off
 setRules([mkRule('a','when a here','1. do a thing.',false)]);await ai(['ok']);pick();
 await send('/rule kuch karo');
 ok(/no custom rules/.test(sysOf(0)),'/rule when every rule is off counts as no rules');
 // size cap
 setRules(Array.from({length:20},(_,i)=>mkRule('r'+i,'w'.repeat(390),'s'.repeat(1490))));await ai(['ok']);pick();
 await send('/rule kuch karo');
 ok(sysOf(0).length<S_BASE()+14500&&/Baaki \d+ rules/.test(sysOf(0)),'many big rules: the block is capped and says how many were left out');
 function S_BASE(){return run('S.system.length')+run('rulesBlock().length')+500}
 // a tool call inside a /rule turn still goes through the normal tools
 setRules([mkRule('t','torch bole to','1. torch on karo.')]);await ai([[{id:'c1',type:'function',function:{name:'torch',arguments:'{"state":"on"}'}}],'torch on kar diya']);pick();
 NATC.length=0;await send('/rule torch jala do');
 ok(fetches.length===2&&NATC.includes('torch')&&/torch on kar diya/.test(last().content),'/rule turn runs the AI tool loop as usual (tool call executed)');
 // chat-only provider cannot follow rules: it is skipped, the next provider with tools answers
 run("S.prov='chaman'");setRules([mkRule('t','torch bole to','1. torch on karo.')]);await ai(['groq ne jawab diya']);pick();
 await send('/rule torch jala do');
 ok(fetches.length===1&&/Najeef started this message with \/rule/.test(sysOf(0))&&/groq ne jawab diya/.test(last().content)&&last().by==='Groq','/rule with the chat-only model selected: skipped, a provider with tools answers (with the rules)');
 // only the chat-only model available: clear message, no fake answer
 run("S.keys.groq='';S.prov='chaman'");await ai(['x']);pick();
 await send('/rule torch jala do');
 ok(fetches.length===0&&last().err&&/tools wala provider/.test(last().content),'/rule with only the chat-only Chaman model: clear message, no fake answer');
 run("S.keys.groq='k';S.prov='groq'");

 // ===== C. rule_save / rule_list through the real execTool
 const confirmLog=[],TC={ans:true};
 ctx.tconfirm=async(h,b,w,l,by)=>{confirmLog.push({h,b,w,l,by});return TC.ans};
 const call=async(name,a)=>{const steps=[];const res=await run('execTool')(name,a,steps);return String(res)};
 run('CR=[]');delete FILES['/sdcard/Chaman/rules.json'];
 const good={name:'Playlist Add',when:'Link ke saath bole: isko playlist me add kar',steps:'1. termux_run yt-dlp.\n2. Fail ho to batao.'};
 let o=await call('rule_save',good);
 ok(/Rule save ho gaya: playlist_add/.test(o)&&run('CR').length===1&&run('CR')[0].name==='playlist_add'&&/\/rule/.test(o),'rule_save: saved (name slugged), tells him to use /rule');
 ok(confirmLog.length===1&&/Naya rule save karu/.test(confirmLog[0].h)&&/jab: Link ke saath/.test(confirmLog[0].b)&&/termux_run yt-dlp/.test(confirmLog[0].b)&&confirmLog[0].by==='Rule'&&confirmLog[0].l==='Save karo','confirm card shows the whole rule');
 ok(run("ld('nap_rules',[])")[0].name==='playlist_add'&&JSON.parse(FILES['/sdcard/Chaman/rules.json']).rules[0].name==='playlist_add','saved on the phone and mirrored to /sdcard/Chaman/rules.json');
 confirmLog.length=0;o=await call('rule_save',Object.assign({},good,{when:'naya when text'}));
 ok(/Rule update karu/.test(confirmLog[0].h)&&run('CR').length===1&&run('CR')[0].when==='naya when text','same name = update');
 run('CR[0].on=false;CR[0].uses=7');await call('rule_save',good);
 ok(run('CR')[0].on===false&&run('CR')[0].uses===7,'update keeps on/off and use count');
 TC.ans=false;confirmLog.length=0;o=await call('rule_save',Object.assign({},good,{name:'other'}));
 ok(/cancel kiya/.test(o)&&run('CR').length===1,'Najeef says no: nothing saved');TC.ans=true;
 confirmLog.length=0;
 for(const [bad,re] of [[{when:'x when',steps:'1. do it now.'},/name/],[{name:'a',steps:'1. do it now.'},/when/],[{name:'a',when:'x when'},/steps/],[{name:'a',when:'ab',steps:'1. do it now.'},/when/],[{name:'a',when:'x when',steps:'1.'},/steps/],[{name:'a',when:'w'.repeat(401),steps:'1. do it now.'},/when bahut lamba/],[{name:'a',when:'x when',steps:'s'.repeat(1501)},/steps bahut lambe/]]){
   o=await call('rule_save',bad);if(!(/Rule me galti/.test(o)&&re.test(o)))ok(false,'validation: '+JSON.stringify(bad).slice(0,60)+' -> '+o);else ok(true,'validation refuses: '+re);
 }
 ok(confirmLog.length===0&&run('CR').length===1,'invalid rules never reach the confirm card');
 o=await call('rule_save',{name:'lst',when:['phrase one','phrase two'],steps:['1. first thing','2. second thing']});
 ok(/save ho gaya: lst/.test(o)&&/phrase one\nphrase two/.test(run('CR').find(r=>r.name==='lst').when)&&/1\. first thing\n2\. second thing/.test(run('CR').find(r=>r.name==='lst').steps),'a list of lines is accepted and joined');
 run('CR=Array.from({length:20},(_,i)=>({id:i,name:"r"+i,on:true,when:"when "+i,steps:"1. step "+i,uses:0}))');
 o=await call('rule_save',Object.assign({},good,{name:'twentyone'}));ok(/Max 20/.test(o),'21st rule refused');
 o=await call('rule_save',Object.assign({},good,{name:'r3'}));ok(/save ho gaya: r3/.test(o)&&run('CR').length===20,'but updating an existing one at the limit works');
 run('CR=[]');o=await call('rule_list',{});ok(/Koi rule nahi/.test(o),'rule_list empty');
 await call('rule_save',good);o=await call('rule_list',{});ok(/playlist_add/.test(o)&&/Link ke saath/.test(o)&&!/termux_run/.test(o),'rule_list shows name and when, not the steps');
 const lgl=run('logTool')('rule_save',{name:'secret_name',when:'SECRETWHEN',steps:'SECRETSTEPS 1. x'});
 ok(!/SECRET/.test(lgl)&&/chars/.test(lgl),'log line for rule_save has no rule text');
 ok(!run('TOOLS.map(t=>t.function.name)').some(n=>/^rule_(delete|run)$/.test(n))&&run('TOOLS.find(x=>x.function.name==="rule_save").function.parameters.required.join()')==='name,when,steps','AI can save and list rules only (no delete, no run tool)');

 // ===== D. restore from the mirror file
 run('CR=[]');run("sv('nap_rules',[])");
 FILES['/sdcard/Chaman/rules.json']=JSON.stringify({v:2,rules:[{id:'k1',name:'keep',when:'wh en',steps:'1. do it',on:true,uses:3},{name:'',when:'',steps:''}]});
 await run('crRestore')();
 ok(run('CR').length===1&&run('CR')[0].name==='keep'&&run('CR')[0].uses===3,'restore: valid rule back, broken one dropped');
 FILES['/sdcard/Chaman/rules.json']=JSON.stringify({rules:[OLD[0]]});run('CR=[]');await run('crRestore')();
 ok(run('CR').length===1&&/termux_run chalao/.test(run('CR')[0].steps),'restore also understands the older file format');
 run('CR.push(CR[0])');FILES['/sdcard/Chaman/rules.json']=JSON.stringify({rules:[]});await run('crRestore')();ok(run('CR').length===2,'restore does nothing when the phone already has rules');
 FILES['/sdcard/Chaman/rules.json']='not json';run('CR=[]');await run('crRestore')();ok(run('CR').length===0,'a broken file is ignored');
 ctx.tconfirm=run('tconfirm');

 // ===== E. /rules
 run('CR=[]');setRules([mkRule('playlist_add','Link ke saath bole: isko playlist me add kar.','1. termux_run: yt-dlp.\n2. fail to batao.'),mkRule('gm','gm bole to','1. good morning bolo.')]);
 const cmd=async a=>{run('H.length=0');await run('rulesCmd')(a);return last().content};
 ok(run('SLASH.some(c=>c.name==="rules")')&&run('SLASH.find(c=>c.name==="rule").rulemode')===true,'/rule (use) and /rules (manage) are in the slash list');
 let c=await cmd('');ok(/1\. playlist_add/.test(c)&&/2\. gm/.test(c)&&/\/rules show/.test(c),'/rules lists numbered rules');
 c=await cmd('show 1');ok(/jab: Link ke saath/.test(c)&&/steps:\n1\. termux_run/.test(c),'/rules show 1');
 c=await cmd('show play');ok(/playlist_add/.test(c),'/rules show by name prefix');
 c=await cmd('show 9');ok(/nahi mila/.test(c),'unknown number');
 c=await cmd('off gm');ok(run('CR')[1].on===false&&/off hai/.test(c),'/rules off gm');
 c=await cmd('list');ok(/\[off\] gm/.test(c),'off marked in list');
 c=await cmd('on 2');ok(run('CR')[1].on===true,'/rules on 2');
 c=await cmd('del 1');ok(run('CR').length===1&&run('CR')[0].name==='gm'&&/hata diya/.test(c)&&run("ld('nap_rules',[])").length===1,'/rules del 1 (saved)');
 c=await cmd('help');ok(/Custom rules/.test(c),'/rules help');
 c=await cmd('banana');ok(/Samajh nahi aaya/.test(c),'unknown subcommand -> help');
 run('CR=[]');c=await cmd('');ok(/koi rule nahi/i.test(c)&&/AI ko bolo/.test(c),'empty list says how to make one');

 // ===== F. wiring
 const chatSrc=fs.readFileSync('js/chat.js','utf8');
 ok(/tn\.rule=rmode/.test(chatSrc)&&chatSrc.indexOf('crBlock()')>chatSrc.indexOf('rulesBlock()')&&!/crTry/.test(chatSrc)&&/if\(p\.g\)\{if\(tn\.rule\)continue/.test(chatSrc),'chat.js: rule mode flag, block added after the app rules, chat-only provider skipped, no old matcher');
 ok(!/crMatch|crRun|crExec|crTry|LAST_TOOL_BAD/.test(fs.readFileSync('js/crules.js','utf8')+fs.readFileSync('js/tools.js','utf8')),'the old matcher and step engine are gone');
 const idx=fs.readFileSync('index.html','utf8');
 ok(idx.indexOf('js/crules.js')>idx.indexOf('js/sched.js')&&idx.indexOf('js/crules.js')<idx.indexOf('js/rules.js'),'crules.js loads after sched.js and before rules.js');
 ok(/rule_list/.test(fs.readFileSync('js/tools.js','utf8').match(/logAdd\(fl\.bad[^\n]*/)[0]),'execTool does not log the rule_list result');
 const rt=run('ruleText')('myrules');
 ok(/\/rule/.test(rt)&&/rule_save/.test(rt)&&/Allow/.test(rt)&&/<link>/.test(rt)&&/plain/.test(rt)&&/Not built yet/.test(rt)&&/yt-dlp/.test(rt)&&/If he asks for a rule without typing \/rule/.test(rt),'rules text: how /rule works, rule_save, Allow card, <link>, example, not built yet');
 ok(run('ruleAreas')('mera ek custom rule bana de').includes('myrules')&&run('ruleAreas')('jab main playlist add bolu to ye karna').includes('myrules'),'rules area auto-injects for rule making');
 ok(run('TOOLS.find(x=>x.function.name==="rules_read").function.parameters.properties.area.enum').includes('myrules'),'rules_read knows myrules');
 ok(/rule_save/.test(run('skillText()')),'skill lists rule_save');
 ok(/^\d+\.\d{5}\.\d+$/.test(run('APP_VER'))&&(+run('APP_VER').split('.')[1]>30000||run('APP_VER')==='1.30000.1'||+run('APP_VER').split('.')[2]>=1),'version is at least 1.30000.1: '+run('APP_VER'));
 console.log(fails?('\n'+fails+' FAIL'):'\nALL PASS');
 process.exit(fails?1:0);
})();
