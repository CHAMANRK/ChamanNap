// Step23 (3a): custom rules (crules.js): loose matching, variables, shell safety, validation, the step engine (if/else, stop, onfail), crTry, rule_save/rule_list through execTool, persistence, /rule, wiring.
const vm=require('vm'),fs=require('fs');
const els={},handlers={};
const mk=sel=>{const o={value:'',style:{},dataset:{},options:[],classList:{add(){},remove(){},toggle(){}},addEventListener(t,f){const k=sel+':'+t,pv=handlers[k];handlers[k]=pv?async e=>{await pv(e);await f(e)}:f},insertAdjacentHTML(){},querySelector(){return mk('x')},closest(){return null},appendChild(){},remove(){},select(){},click(){},focus(){},set onclick(f){handlers[sel+':click']=f},set onchange(f){handlers[sel+':change']=f},scrollHeight:0,scrollTop:0,disabled:false,textContent:'',srcdoc:''};let h='';Object.defineProperty(o,'innerHTML',{get(){return h},set(v){h=v}});return o};
const doc={querySelector:s=>els[s]||(els[s]=mk(s)),createElement:()=>mk('c'),body:mk('body'),documentElement:{dataset:{}},addEventListener(){}};
const store={},sent=[],pills=[];let failWith=null,failPkgOnly=false;
const ctx={document:doc,localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=v}},matchMedia:()=>({matches:true,addEventListener(){}}),navigator:{},console,setTimeout:(f,ms)=>setTimeout(f,Math.min(ms,3)),clearTimeout,URL,Image:function(){},fetch:async()=>({ok:true,status:200,json:async()=>({choices:[{message:{role:'assistant',content:'ok'}}]}),text:async()=>''})};
ctx.window=ctx;
const FILES={},TM={run:null},calls={files:[]};
ctx.Capacitor={nativePromise:async(pl,m,o)=>{
  if(pl==='Files'){
    calls.files.push([m,o&&o.path]);
    if(m==='write'){FILES[o.path]=o.content;return{ok:true}}
    if(m==='read'){if(FILES[o.path]==null)return Promise.reject(Object.assign(new Error('nf'),{code:'NOT_FOUND'}));return{text:FILES[o.path]}}
    return{};
  }
  if(pl==='Termux'&&m==='run'){if(TM.run)return TM.run(o);return Promise.reject(Object.assign(new Error('x'),{code:'NOT_INSTALLED'}))}
  return{};
}};
vm.createContext(ctx);
process.chdir(__dirname+'/../www');
for(const f of ['version','prompts','core','status','providers','chat','settings','attach','keys','helpers','phone','tools','termux','workspace','files','notes','slash','fast','intents','termuxapi','runner','sched','crules','rules','log','main'])vm.runInContext(fs.readFileSync('js/'+f+'.js','utf8'),ctx,{filename:f+'.js'});
const t=s=>vm.runInContext(s,ctx);
let fails=0;const ok=(c,l)=>{console.log((c?'PASS ':'FAIL ')+l);if(!c)fails++};
const cp=require('child_process');
const realExec=ctx.execTool,realConfirm=ctx.tconfirm;
// mock execTool: results come from a queue of {ok,text}; every call is recorded
const EX={calls:[],q:[],stopAt:0};
ctx.execTool=async(name,a,steps)=>{
  EX.calls.push({name,a:JSON.parse(JSON.stringify(a))});
  const r=EX.q.length?EX.q.shift():{ok:true,text:name+' ok'};
  steps.push(name+' '+(r.ok?'ok':'fail'));
  t('LAST_TOOL_BAD='+(r.ok?'false':'true'));
  if(EX.stopAt&&EX.calls.length===EX.stopAt){t('TURN.stop=true')}
  return r.text;
};
const run=async(n,msg)=>{EX.calls.length=0;return await t('crRun')(t('CR').find(r=>r.name===n),msg||'',{via:'test'})};
const mkRule=(o)=>{const v=t('crValidate')(Object.assign({name:'r1',triggers:['hello rule'],steps:[{do:'reply',text:'hi'}]},o));return v};
const setRules=a=>{t('CR=[]');for(const o of a){const v=mkRule(o);if(!v.ok){console.log('BAD TEST RULE',o.name,v.errs);fails++;continue}v.rule.id='x'+o.name;v.rule.on=o.on!==false;t('CR.push('+JSON.stringify(v.rule)+')')}};
const H=()=>t('H'),lastMsg=()=>t('H')[t('H').length-1];
(async()=>{
 // ===== A. tokens and loose word matching
 const tok=s=>t('crTok')(s),sc=(a,b)=>t('crTokScore')(a,b);
 ok(tok('Isko playlist me add kar do').join()==='playlist,add','filler words (isko, me, kar, do) are dropped: '+tok('Isko playlist me add kar do').join());
 ok(tok('kar do').join()==='kar,do','a phrase made only of filler words keeps its words');
 ok(tok('Add THIS music, in playlist!!').join()==='add,music,playlist','case and punctuation ignored');
 ok(tok('https://x.com/a gaana add').join()==='gaana,add','URLs are not words');
 ok(sc('playlist','playlist')===1&&sc('playlist','plylist')>=.8&&sc('playlist','playlst')>=.8&&sc('playlist','playlists')>=.8&&sc('playlist','plyalist')>=.8,'typos, swapped letters and plural count as the same word');
 ok(sc('daal','daalo')>=.8&&sc('add','ad')===0&&sc('add','adds')===0&&sc('music','magic')===0&&sc('playlist','plant')===0,'short words must be exact, different words do not match');
 ok(sc('download','downlaod')>=.8&&sc('download','downlod')>=.8,'longer words allow 2 mistakes');

 // ===== B. levels
 setRules([{name:'playlist_add',triggers:['add this music in playlist','isko playlist me add kar','playlist add'],need:['link'],steps:[{do:'reply',text:'ok'}]},
           {name:'gm',triggers:['gm'],steps:[{do:'reply',text:'gm'}]},
           {name:'careful',triggers:['sab kuch hatao'],auto:false,steps:[{do:'reply',text:'x'}]},
           {name:'off_rule',triggers:['zebra crossing'],on:false,steps:[{do:'reply',text:'x'}]}]);
 const lv=m=>{const x=t('crMatch')(m);return x?x.rule.name+':'+x.level:'none'};
 ok(lv('add this music in playlist https://www.instagram.com/reel/abc/')==='playlist_add:auto','exact phrase + link -> runs by itself');
 ok(lv('bhai ye music playlist me add kar de')==='playlist_add:auto','hinglish variant runs by itself');
 ok(lv('plylist add kar https://x.y/z')==='playlist_add:auto','one typo still runs by itself');
 ok(lv('plylst ad kar https://x.y/z')!=='playlist_add:auto','two typos in a two-word trigger only ask (or nothing)');
 ok(lv('playlist add')==='playlist_add:auto','short keywords run by themselves');
 ok(lv('Add playlist')==='playlist_add:auto','word order does not matter');
 ok(lv('playlist kaise banate hain?')==='none','a question about playlists does not run the rule');
 ok(lv('isko playlist me add kar?')==='playlist_add:ask','a question mark makes it ask first');
 ok(lv('mujhe ek playlist banani hai jisme purane gaane add ho')==='playlist_add:ask','long chatty message with the words asks first');
 ok(lv('aaj mausam kaisa hai')==='none','unrelated message -> normal chat');
 ok(lv('gm')==='gm:auto','one-word trigger alone runs');
 ok(lv('gm bhai kya haal hai aaj')==='gm:ask','one-word trigger inside a longer message only asks');
 ok(lv('kal ka gm bhejna sabko jaldi se please aur batana')==='none','one-word trigger lost in a long message is ignored');
 ok(lv('sab kuch hatao')==='careful:ask','auto:false rule always asks');
 ok(lv('zebra crossing')==='none','rule that is off never matches');
 ok(lv('')==='none'&&lv('   ')==='none','empty message matches nothing');
 // best rule wins
 setRules([{name:'a',triggers:['music add'],steps:[{do:'reply',text:'a'}]},{name:'b',triggers:['music add playlist'],steps:[{do:'reply',text:'b'}]}]);
 ok(lv('music add playlist')==='b:auto','the more exact rule wins');
 // speed
 setRules(Array.from({length:30},(_,i)=>({name:'r'+i,triggers:Array.from({length:8},(_,j)=>'kuch alag words '+i+'x'+j+' yahan'),steps:[{do:'reply',text:'x'}]})));
 const t0=Date.now();for(let i=0;i<50;i++)t('crMatch')('ek lamba sa message jisme bahut saare alag alag words hain aur ek link bhi hai');
 ok(Date.now()-t0<1500,'30 rules x 8 triggers x 50 messages is fast ('+(Date.now()-t0)+' ms)');

 // ===== C. variables
 const V=t('crVars')('Add this https://www.instagram.com/reel/abc/?igsh=1. aur https://b.co/x), bas');
 ok(V.link==='https://www.instagram.com/reel/abc/?igsh=1'&&V.links.split(' ').length===2&&V.links.endsWith('https://b.co/x'),'first link, all links, trailing . ) removed');
 ok(V.rest==='Add this . aur , bas'||V.rest==='Add this . aur ), bas'||/^Add this/.test(V.rest),'rest = message without links');
 ok(t('crVars')('sirf text').link===''&&/^\d{4}-\d\d-\d\d$/.test(V.date)&&/^\d\d:\d\d$/.test(V.time),'no link -> empty, date and time filled');

 // ===== D. templates and shell safety (real shell)
 const fillS=(c,vals)=>t('crFill')(c,vals,true);
 const sh=c=>cp.execFileSync('sh',['-c',c]).toString();
 const evil='https://a.b/$(echo INJECTED)`echo INJ2`;echo INJ3';
 ok(sh('printf %s '+fillS('{link}',{link:evil}))===evil,'a link with $( ) ` ; stays plain text in the shell');
 const evil2="it's $(echo X) \"q\" ; rm -rf x";
 ok(sh('printf %s '+fillS('{rest}',{rest:evil2}))===evil2,'free text with quotes and $( ) stays plain text in the shell');
 ok(sh('printf %s '+fillS('{link}',{link:''}))==='','empty value becomes an empty argument');
 ok(sh('printf "%s|" '+fillS('{a} {b}',{a:'x y',b:'z'}))==='x y|z|','two variables become two arguments');
 ok(t('crFill')('{link} {nope}',{link:'L'},false)==='L ','plain fill: unknown variable becomes empty');
 ok(t('crFill')('a{link}b',{link:'x\u0000\u0007y'},false)==='axyb','control characters are removed from values');
 ok(t('crFill')('{rest}',{rest:'a'.repeat(9000)},false).length===4000,'a value is cut at 4000 chars');
 const fa=t('crFillArgs')('termux_run',{command:'yt-dlp {link}',timeout_s:5,note:'{link}'},{link:"h't"});
 ok(fa.command==="yt-dlp 'h'\\''t'"&&fa.note==="h't",'only the termux_run command is shell-quoted, other args stay plain');
 const fb=t('crFillArgs')('open_url',{uri:'{link}'},{link:'https://a.b'});
 ok(fb.uri==='https://a.b','other tools get plain values');
 const bad=c=>t('crShellBad')(c).join();
 ok(bad('yt-dlp {link}')===''&&bad('echo a {link} b {rest}')==='','placeholders outside quotes are fine');
 ok(bad('echo "{link}"')==='{link}'&&bad("echo '{link}'")==='{link}','placeholder inside quotes is refused');
 ok(bad('echo \\{link}')==='{link}','placeholder after a backslash is refused');
 ok(bad('echo "x\'y" {link}')===''&&bad('echo \'a\'"b" {link}')==='','quotes that are closed before the placeholder are fine');

 // ===== E. validation
 const val=o=>t('crValidate')(o);
 const good={name:'playlist_add',triggers:['add this music in playlist','playlist add'],need:['link'],steps:[{do:'tool',tool:'termux_run',args:{command:'yt-dlp -x -o /sdcard/Vibe_Sound/%(title)s.%(ext)s {link}',timeout_s:300},as:'dl'},{do:'if',cond:'ok',then:[{do:'reply',text:'Save ho gaya {dl}'}],else:[{do:'reply',text:'Fail'}]}]};
 ok(val(good).ok,'the playlist example rule is valid');
 ok(!val({}).ok&&!val(null).ok&&!val('x').ok,'empty or wrong input is refused');
 ok(val(Object.assign({},good,{name:'Mera Rule!'})).rule.name==='mera_rule','name becomes a safe slug');
 ok(val(Object.assign({},good,{triggers:[]})).errs.some(e=>/triggers/.test(e)),'no triggers refused');
 ok(val(Object.assign({},good,{triggers:['kar do']})).ok,'a trigger made only of filler words is still allowed');
 ok(val(Object.assign({},good,{triggers:['???']})).errs.some(e=>/shabd/.test(e)),'a trigger without any word is refused');
 ok(val(Object.assign({},good,{triggers:Array.from({length:12},(_,i)=>'t'+i+'abc')})).rule.triggers.length===8,'at most 8 triggers');
 ok(val(Object.assign({},good,{need:['link','phone']})).errs.some(e=>/need/.test(e)),'unknown need refused');
 ok(val(Object.assign({},good,{steps:[{do:'tool',tool:'no_such_tool'}]})).errs.some(e=>/nahi mila/.test(e)),'unknown tool refused');
 ok(val(Object.assign({},good,{steps:[{do:'tool',tool:'rule_save',args:{}}]})).errs.some(e=>/rule ke andar/.test(e)),'a rule cannot call rule_save');
 ok(val(Object.assign({},good,{steps:Array.from({length:16},()=>({do:'reply',text:'x'}))})).errs.some(e=>/Max 15/.test(e)),'16 steps refused');
 ok(val(Object.assign({},good,{steps:Array.from({length:15},()=>({do:'reply',text:'x'}))})).ok,'15 steps fine');
 const deep=d=>d?{do:'if',cond:'ok',then:[deep(d-1)]}:{do:'reply',text:'x'};
 ok(val(Object.assign({},good,{steps:[deep(3)]})).ok&&val(Object.assign({},good,{steps:[deep(4)]})).errs.some(e=>/level/.test(e)),'if inside if inside if is fine, a 4th level is refused');
 ok(val(Object.assign({},good,{steps:[{do:'if',cond:'banana',then:[{do:'reply',text:'x'}]}]})).errs.some(e=>/cond/.test(e)),'bad condition refused');
 ok(['ok','fail','not:ok','has:done','miss:error','set:dl','empty:dl','eq:dl=1'].every(c=>t('crCondOk')(c))&&t('crCondOk')({all:['ok','has:x']})&&t('crCondOk')({any:['fail','miss:y']})&&!t('crCondOk')({all:[]})&&!t('crCondOk')({all:['ok','nonsense']}),'all condition forms are accepted, nonsense is not');
 ok(val(Object.assign({},good,{steps:[{do:'reply',text:'hi {ghost}'}]})).errs.some(e=>/\{ghost\}/.test(e)),'a variable nobody defined is refused');
 ok(val(Object.assign({},good,{steps:[{do:'tool',tool:'torch',args:{state:'on'},as:'x'},{do:'reply',text:'{x} {prev} {link} {rest} {msg} {date} {time} {name} {links}'}]})).ok,'as-variables and all built-in variables are known');
 ok(val(Object.assign({},good,{steps:[{do:'tool',tool:'torch',args:{state:'on'},as:'link'}]})).errs.some(e=>/as/.test(e)),'as cannot reuse a built-in name');
 ok(val(Object.assign({},good,{steps:[{do:'set',var:'prev',value:'x'}]})).errs.some(e=>/set/.test(e)),'set cannot overwrite a built-in variable');
 ok(val(Object.assign({},good,{steps:[{do:'tool',tool:'termux_run',args:{}}]})).errs.some(e=>/command/.test(e)),'termux_run needs a command');
 ok(val(Object.assign({},good,{steps:[{do:'tool',tool:'termux_run',args:{command:'echo "{link}"'}}]})).errs.some(e=>/quotes/.test(e)),'{link} inside quotes in a termux command is refused when saving');
 ok(val(Object.assign({},good,{steps:[{do:'tool',tool:'torch',args:{note:'x'.repeat(4000)}}]})).errs.some(e=>/bade/.test(e)),'huge args refused');
 ok(val(Object.assign({},good,{steps:[{do:'reply',text:''}]})).errs.some(e=>/reply/.test(e)),'empty reply refused');
 ok(val(Object.assign({},good,{steps:[{do:'dance'}]})).errs.some(e=>/do ko/.test(e)),'unknown step type refused');
 ok(val(Object.assign({},good,{steps:[]})).errs.some(e=>/steps/.test(e)),'no steps refused');
 ok(val(Object.assign({},good,{steps:[{do:'tool',tool:'torch',args:{state:'on'},onfail:'continue'}]})).rule.steps[0].onfail==='continue','onfail continue is kept, default is stop');
 ok(val(Object.assign({},good,{steps:[{do:'reply',text:'x'.repeat(21000/10)},{do:'reply',text:'y'.repeat(900)},{do:'reply',text:'z'.repeat(900)},{do:'reply',text:'q'.repeat(900)},{do:'reply',text:'w'.repeat(900)},{do:'reply',text:'e'.repeat(900)},{do:'reply',text:'e'.repeat(900)},{do:'reply',text:'e'.repeat(900)},{do:'reply',text:'e'.repeat(900)},{do:'reply',text:'e'.repeat(900)},{do:'reply',text:'e'.repeat(900)},{do:'reply',text:'e'.repeat(900)},{do:'reply',text:'e'.repeat(900)},{do:'reply',text:'e'.repeat(900)},{do:'reply',text:'e'.repeat(900)}]})).ok===false,'a rule over 20000 chars or with an oversized reply is refused');

 // ===== F. engine (mock tools)
 setRules([{name:'dl',triggers:['download this'],need:['link'],steps:[
   {do:'tool',tool:'termux_run',args:{command:'yt-dlp {link} -o {name}'},as:'out'},
   {do:'if',cond:'ok',then:[{do:'reply',text:'Saved: {out} for {link}'}],else:[{do:'reply',text:'nahi hua'}]}]}]);
 EX.q=[{ok:true,text:'DONE-123'}];
 let r=await run('dl','download this https://a.b/c');
 ok(EX.calls.length===1&&EX.calls[0].name==='termux_run'&&EX.calls[0].a.command==="yt-dlp 'https://a.b/c' -o 'dl'",'step runs with the link and name shell-quoted: '+(EX.calls[0]&&EX.calls[0].a.command));
 ok(/Saved: DONE-123 for https:\/\/a\.b\/c/.test(r.content)&&/Rule: dl/.test(r.by),'then-branch runs, {out} and {link} filled in the reply');
 ok(t('CR')[0].uses===1&&!!t('CR')[0].last,'uses and last-run time updated');
 EX.q=[{ok:false,text:'exit 1: boom'}];
 r=await run('dl','download this https://a.b/c');
 ok(/nahi hua/.test(r.content)===false&&/ruk gaya/.test(r.content)&&/Step 1 \(termux_run\) fail/.test(r.content)&&/boom/.test(r.content),'a failed step stops the rule by default and says why');
 // onfail continue + else branch
 setRules([{name:'c',triggers:['try it'],steps:[{do:'tool',tool:'torch',args:{state:'on'},onfail:'continue'},{do:'if',cond:'fail',then:[{do:'reply',text:'failed branch'}],else:[{do:'reply',text:'ok branch'}]},{do:'reply',text:'end'}]}]);
 EX.q=[{ok:false,text:'bad'}];r=await run('c','try it');ok(/failed branch/.test(r.content)&&/end/.test(r.content),'onfail continue: if fail branch runs and the rule goes on');
 EX.q=[{ok:true,text:'fine'}];r=await run('c','try it');ok(/ok branch/.test(r.content)&&!/failed branch/.test(r.content),'else branch when the step worked');
 // conditions on text
 setRules([{name:'x',triggers:['cond test'],steps:[
   {do:'tool',tool:'torch',args:{state:'on'}},
   {do:'if',cond:'has:HELLO',then:[{do:'reply',text:'has'}]},
   {do:'if',cond:'miss:zzz',then:[{do:'reply',text:'miss'}]},
   {do:'if',cond:'not:has:HELLO',then:[{do:'reply',text:'WRONG'}],else:[{do:'reply',text:'notelse'}]},
   {do:'set',var:'v',value:'Abc'},
   {do:'if',cond:'eq:v=abc',then:[{do:'reply',text:'eq'}]}]},
  {name:'y',triggers:['cond two'],steps:[
   {do:'tool',tool:'torch',args:{state:'on'}},
   {do:'set',var:'v',value:'Abc'},
   {do:'if',cond:'set:v',then:[{do:'reply',text:'set'}]},
   {do:'if',cond:'empty:rest',then:[{do:'reply',text:'emptyrest'}]},
   {do:'if',cond:{all:['ok','has:hello']},then:[{do:'reply',text:'all'}]},
   {do:'if',cond:{any:['fail','has:nothing','has:hell']},then:[{do:'reply',text:'any'}]},
   {do:'if',cond:'has:{v}',then:[{do:'reply',text:'WRONG2'}],else:[{do:'reply',text:'var-in-cond'}]}]}]);
 EX.q=[{ok:true,text:'say hello world'}];r=await run('x','cond test');
 EX.q=[{ok:true,text:'say hello world'}];const r2=await run('y','');
 const allc=r.content+' | '+r2.content;
 ok(['has','miss','notelse','eq','set','emptyrest','all','any','var-in-cond'].every(w=>allc.indexOf(w)>=0)&&allc.indexOf('WRONG')<0,'has / miss / not / eq / set / empty / all / any / variable in cond all behave: '+allc.replace(/\n+/g,' | '));
 // if before any tool step
 setRules([{name:'n',triggers:['no tool yet'],steps:[{do:'if',cond:'ok',then:[{do:'reply',text:'WRONG'}],else:[{do:'reply',text:'no-last'}]}]}]);
 r=await run('n','no tool yet');ok(/no-last/.test(r.content)&&!/WRONG/.test(r.content),'ok is false when no tool step ran yet');
 // stop step, nested stop
 setRules([{name:'s',triggers:['stop here'],steps:[{do:'reply',text:'one'},{do:'if',cond:'miss:zz',then:[{do:'stop',text:'halt'}]},{do:'reply',text:'never'}]}]);
 r=await run('s','stop here');ok(/one/.test(r.content)&&/halt/.test(r.content)&&!/never/.test(r.content),'stop step ends the rule from inside an if');
 // default text
 setRules([{name:'d',triggers:['default text'],steps:[{do:'tool',tool:'torch',args:{state:'on'}}]}]);
 r=await run('d','default text');ok(/ho gaya \(1 step\)/.test(r.content),'no reply step -> "ho gaya (1 step)"');
 // run cap (rules restored from a file can bypass validation)
 const many={name:'m',steps:Array.from({length:60},()=>({do:'tool',tool:'torch',args:{state:'on'}}))};
 EX.calls.length=0;r=await t('crRun')(Object.assign({triggers:['m'],need:[],on:true,id:'m'},many),'m',{});
 ok(EX.calls.length===40&&/limit/.test(r.content),'a runaway rule stops at 40 steps');
 // user presses Stop in the middle
 setRules([{name:'st',triggers:['stop me'],steps:[{do:'tool',tool:'torch',args:{state:'on'}},{do:'tool',tool:'torch',args:{state:'off'}},{do:'reply',text:'never'}]}]);
 EX.stopAt=1;t('TURN={stop:false,tool:""}');r=await run('st','stop me');EX.stopAt=0;
 ok(EX.calls.length===1&&/Stop dabaya/.test(r.content)&&!/never/.test(r.content),'Stop button ends the rule after the running step');
 t('TURN=null');
 // thrown error inside a tool
 const keepEx=ctx.execTool;ctx.execTool=async()=>{throw new Error('kaboom')};
 setRules([{name:'e',triggers:['err rule'],steps:[{do:'tool',tool:'torch',args:{state:'on'}},{do:'reply',text:'never'}]}]);
 r=await t('crRun')(t('CR')[0],'err rule',{});ok(/kaboom/.test(r.content)&&/ruk gaya/.test(r.content)&&!/never/.test(r.content),'an exception in a tool is a failed step, not a crash');
 ctx.execTool=keepEx;
 // needs
 setRules([{name:'nd',triggers:['need link'],need:['link'],steps:[{do:'reply',text:'got {link}'}]},{name:'nr',triggers:['need text'],need:['rest'],steps:[{do:'reply',text:'got [{rest}]'}]}]);
 TM.run=null;r=await run('nd','need link');ok(/link/.test(r.content)&&/chahiye/.test(r.content)&&EX.calls.length===0,'link missing everywhere -> asks for it, nothing runs');
 TM.run=async o=>({stdout:'copied: https://c.d/e. \n',exitCode:0});
 r=await run('nd','need link');ok(/got https:\/\/c\.d\/e/.test(r.content)&&r.steps.some(s=>/clipboard/.test(s)),'link comes from the clipboard when the message has none');
 r=await run('nd','need link https://m.n/o');ok(/got https:\/\/m\.n\/o/.test(r.content),'a link in the message wins over the clipboard');
 TM.run=null;
 const runT=async(n,msg,trig)=>{EX.calls.length=0;return await t('crRun')(t('CR').find(r=>r.name===n),msg,{via:'test',trig})};
 r=await runT('nr','need text','need text');ok(/text/.test(r.content)&&/chahiye/.test(r.content),'rest missing (only the trigger words were said) -> asks for text');
 r=await runT('nr','need text something else','need text');ok(/got \[something else\]/.test(r.content),'{rest} = message without the trigger words');
 r=await run('nr','something typed after /rule run');ok(/got \[something typed after \/rule run\]/.test(r.content),'without a trigger (/rule run) {rest} is the whole text without links');
 const cr=(m,tg)=>t('crRest')(m,tg);
 ok(cr('playlist add doodh lao','playlist add')==='doodh lao','crRest: trigger words removed');
 ok(cr('isko playlist me add kar buy milk','playlist add')==='buy milk','crRest: filler words at the ends removed');
 ok(cr('plylist add https://a.b/c ye gaana','playlist add')==='ye gaana'||cr('plylist add https://a.b/c ye gaana','playlist add')==='gaana','crRest: typo of a trigger word removed too, link removed');
 ok(cr('playlist add','playlist add')==='','crRest: nothing left -> empty');
 ok(cr('note save add milk','note save')==='add milk','crRest: only the trigger words are removed');

 // ===== G. crTry (what the chat calls for every message)
 const TC={n:0,ans:true,head:''};
 ctx.tconfirm=async(h,b,w,l,by)=>{TC.n++;TC.head=h;TC.body=b;TC.by=by;TC.lab=l;return TC.ans};
 setRules([{name:'pl',triggers:['playlist add'],need:['link'],steps:[{do:'reply',text:'added {link}'}]},{name:'dangerous',triggers:['sab hatao'],auto:false,steps:[{do:'reply',text:'hata diya'}]}]);
 EX.calls.length=0;TC.n=0;
 let x=await t('crTry')('playlist add https://a.b/c');
 ok(x&&/added https:\/\/a\.b\/c/.test(x.content)&&TC.n===0,'auto match runs without asking');
 x=await t('crTry')('aaj ka mausam');ok(x===null&&TC.n===0,'no match -> null (message goes to the AI)');
 TC.ans=true;x=await t('crTry')('sab hatao');
 ok(TC.n===1&&/Ye rule chalau/.test(TC.head)&&TC.by==='Rule'&&/dangerous/.test(TC.body)&&x&&/hata diya/.test(x.content),'ask-level: confirm card shows the rule, yes runs it');
 TC.ans=false;TC.n=0;x=await t('crTry')('sab hatao');ok(TC.n===1&&x===null,'ask-level: no -> null, normal chat');
 t('CR.forEach(r=>r.on=false)');x=await t('crTry')('playlist add https://a.b/c');ok(x===null,'all rules off -> null');
 t('CR=[]');x=await t('crTry')('playlist add');ok(x===null,'no rules -> null');
 ctx.tconfirm=realConfirm;

 // ===== H. AI tools through the real execTool
 ctx.execTool=realExec;
 t('CR=[]');FILES['/sdcard/Chaman/rules.json']=undefined;calls.files.length=0;
 const confirmLog=[];ctx.tconfirm=async(h,b,w,l,by)=>{confirmLog.push({h,b,w,l,by});return TC.ans};
 const callTool=async(name,a)=>{const steps=[];const res=await t('execTool')(name,a,steps);return{res:String(res),steps}};
 TC.ans=true;
 let o=await callTool('rule_save',good);
 ok(/Rule save ho gaya: playlist_add/.test(o.res)&&t('CR').length===1&&confirmLog.length===1,'rule_save: confirm card, then saved');
 ok(/Naya rule save karu/.test(confirmLog[0].h)&&/yt-dlp/.test(confirmLog[0].b)&&/add this music in playlist/.test(confirmLog[0].b)&&confirmLog[0].by==='Rule'&&confirmLog[0].l==='Save karo','the confirm card shows the whole rule (triggers and steps)');
 ok(!!t("ld('nap_rules',[])").length&&t("ld('nap_rules',[])")[0].name==='playlist_add','saved in the phone storage');
 ok(!!FILES['/sdcard/Chaman/rules.json']&&JSON.parse(FILES['/sdcard/Chaman/rules.json']).rules[0].name==='playlist_add','mirrored to /sdcard/Chaman/rules.json');
 // update same name
 confirmLog.length=0;o=await callTool('rule_save',Object.assign({},good,{triggers:['naya trigger']}));
 ok(/Rule update karu/.test(confirmLog[0].h)&&t('CR').length===1&&t('CR')[0].triggers[0]==='naya trigger','same name = update (asks as an update)');
 t('CR[0].on=false;CR[0].uses=7');o=await callTool('rule_save',good);
 ok(t('CR')[0].on===false&&t('CR')[0].uses===7,'an update keeps on/off and use count');
 // cancel
 TC.ans=false;confirmLog.length=0;o=await callTool('rule_save',Object.assign({},good,{name:'other'}));
 ok(/cancel kiya/.test(o.res)&&t('CR').length===1,'Najeef says no -> nothing saved');
 TC.ans=true;
 // invalid -> no card
 confirmLog.length=0;o=await callTool('rule_save',{name:'bad',triggers:[],steps:[{do:'tool',tool:'ghost'}]});
 ok(/Rule me galti/.test(o.res)&&confirmLog.length===0&&t('CR').length===1,'invalid rule: errors go back to the AI, no confirm card');
 // limit
 t('CR=Array.from({length:30},(_,i)=>({id:i,name:"r"+i,on:true,triggers:["a"+i+"bcd"],need:[],steps:[]}))');
 o=await callTool('rule_save',Object.assign({},good,{name:'thirtyone'}));ok(/Max 30/.test(o.res),'31st rule refused');
 // list
 t('CR=[]');o=await callTool('rule_list',{});ok(/Koi rule nahi/.test(o.res),'rule_list empty');
 await callTool('rule_save',good);o=await callTool('rule_list',{});ok(/playlist_add/.test(o.res)&&/add this music in playlist/.test(o.res)&&!/yt-dlp/.test(o.res),'rule_list shows names and triggers, not the steps');
 // log redaction
 const lgl=t('logTool')('rule_save',{name:'secret_name',triggers:['a','b'],steps:[{do:'reply',text:'TOPSECRET'}]});
 ok(!/TOPSECRET/.test(lgl)&&/1 steps/.test(lgl)&&/2 triggers/.test(lgl),'log line for rule_save has no step text');

 // ===== I. restore from the mirror file
 t('CR=[]');t("sv('nap_rules',[])");
 FILES['/sdcard/Chaman/rules.json']=JSON.stringify({v:1,rules:[Object.assign({},good,{id:'keep1',uses:3}),{name:'broken',triggers:[],steps:[{do:'tool',tool:'ghost'}]}]});
 await t('crRestore')();
 ok(t('CR').length===1&&t('CR')[0].name==='playlist_add'&&t('CR')[0].uses===3,'restore: the valid rule comes back, the broken one is dropped');
 ok(t("ld('nap_rules',[])").length===1,'restored rules are saved in phone storage');
 t('CR.push({id:"z",name:"z",on:true,triggers:["zzzz"],need:[],steps:[]})');FILES['/sdcard/Chaman/rules.json']=JSON.stringify({rules:[]});await t('crRestore')();
 ok(t('CR').length===2,'restore does nothing when the phone already has rules');
 FILES['/sdcard/Chaman/rules.json']='not json';t('CR=[]');await t('crRestore')();ok(t('CR').length===0,'a broken file is ignored');
 ctx.tconfirm=realConfirm;

 // ===== J. /rule command
 t('CR=[]');setRules([{name:'playlist_add',triggers:['add this music in playlist','playlist add','isko playlist me daal','one more','another one'],need:['link'],steps:[{do:'tool',tool:'termux_run',args:{command:'yt-dlp {link}'}},{do:'reply',text:'ok'}]},{name:'gm',triggers:['gm'],steps:[{do:'reply',text:'good morning'}]}]);
 ok(t('SLASH.some(c=>c.name==="rule")'),'/rule is in the slash list');
 const cmd=async a=>{t('H.length=0');await t('ruleCmd')(a);return lastMsg().content};
 let c=await cmd('');ok(/1\. playlist_add/.test(c)&&/2\. gm/.test(c)&&/\+2/.test(c),'/rule list numbers the rules and counts extra triggers');
 c=await cmd('list');ok(/1\. playlist_add/.test(c),'/rule list');
 c=await cmd('show 1');ok(/playlist_add/.test(c)&&/yt-dlp/.test(c)&&/chahiye: link/.test(c),'/rule show 1 prints triggers and steps');
 c=await cmd('show playlist');ok(/yt-dlp/.test(c),'/rule show by name prefix');
 c=await cmd('show 9');ok(/nahi mila/.test(c),'unknown rule number');
 c=await cmd('off gm');ok(!t('CR')[1].on&&/off hai/.test(c),'/rule off gm');
 c=await cmd('list');ok(/\[off\] gm/.test(c),'off rules are marked in the list');
 ok(lv('gm')==='none','an off rule does not match');
 c=await cmd('on 2');ok(t('CR')[1].on&&/on hai/.test(c),'/rule on 2');
 c=await cmd('test playlist add https://a.b/c');ok(/playlist_add: SEEDHA/.test(c)&&/gm: milta nahi|gm: nahi/.test(c)&&/Chalega: playlist_add \(seedha\)/.test(c),'/rule test shows scores and who would run');
 c=await cmd('test kuch aur hi');ok(/Koi rule nahi lagega/.test(c),'/rule test with no match');
 c=await cmd('test');ok(/test <jo tu chat me bolta>/.test(c),'/rule test needs a message');
 EX.calls.length=0;ctx.execTool=async(name,a,steps)=>{EX.calls.push({name,a});steps.push('x');t('LAST_TOOL_BAD=false');return'done'};
 t('H.length=0');await t('ruleCmd')('run 1 https://q.r/s');
 ok(EX.calls.length===1&&EX.calls[0].a.command==="yt-dlp 'https://q.r/s'"&&/ok/.test(lastMsg().content)&&lastMsg().by==='Rule: playlist_add','/rule run 1 <link> runs it now with that link');
 c=await cmd('run nothing');ok(/Rule nahi mila/.test(c),'/rule run unknown');
 ctx.execTool=realExec;
 c=await cmd('del 1');ok(t('CR').length===1&&t('CR')[0].name==='gm'&&/hata diya/.test(c),'/rule del 1');
 ok(t("ld('nap_rules',[])").length===1,'deleting is saved');
 c=await cmd('help');ok(/Custom rules/.test(c),'/rule help');
 c=await cmd('banana');ok(/Samajh nahi aaya/.test(c),'unknown subcommand shows help');
 t('CR=[]');c=await cmd('');ok(/koi rule nahi/i.test(c)&&/AI ko bolo/.test(c),'empty list tells how to make a rule');

 // ===== K. wiring in the other files
 const chatSrc=fs.readFileSync('js/chat.js','utf8');
 ok(chatSrc.indexOf('crTry(t)')>0&&chatSrc.indexOf('crTry(t)')<chatSrc.indexOf('turnWait(tn,ask())')&&/!pl\.length&&typeof crTry/.test(chatSrc),'chat: custom rules are tried before the AI, never when files are attached');
 const idx=fs.readFileSync('index.html','utf8');
 ok(idx.indexOf('js/crules.js')>idx.indexOf('js/sched.js')&&idx.indexOf('js/crules.js')<idx.indexOf('js/rules.js'),'crules.js loads after sched.js and before rules.js');
 ok(/rule_list/.test(fs.readFileSync('js/tools.js','utf8').match(/logAdd\(fl\.bad[^\n]*/)[0]),'execTool does not log the rule_list result');
 ok(/by\|\|'Termux'/.test(fs.readFileSync('js/termux.js','utf8')),'confirm card can carry a different label');
 const ar=t('ruleAreas')('jab main playlist add bolu to ye karna');
 ok(ar.includes('myrules')&&ar.length<=3,'rules auto-inject for "jab main ... bolu": '+ar.join());
 ok(t('ruleAreas')('mera ek custom rule bana de').includes('myrules'),'rules auto-inject for "custom rule"');
 const rt=t('ruleText')('myrules');
 ok(/rule_save/.test(rt)&&/NO quotes/.test(rt)&&/onfail/.test(rt)&&/\{link\}/.test(rt)&&/yt-dlp/.test(rt)&&/Allow/.test(rt)&&/Not built yet/.test(rt),'rules text: tool, no-quotes warning, onfail, variables, example, Allow card, what is not built');
 ok(t('TOOLS.find(x=>x.function.name==="rules_read").function.parameters.properties.area.enum').includes('myrules')&&t('RULE_ORDER').includes('myrules'),'rules_read knows myrules');
 ok(/rule_save/.test(t('skillText()')),'skill lists rule_save');
 ok(/^\d+\.\d{5}\.\d+$/.test(t('APP_VER'))&&+t('APP_VER').split('.')[1]>=30000,'version is at least 1.30000.0: '+t('APP_VER'));
 // the example inside the rules text is a valid rule
 const exm=val({name:'playlist_add',triggers:['add this music in playlist','isko playlist me add kar','playlist add'],need:['link'],steps:[{do:'tool',tool:'termux_run',args:{command:'yt-dlp -x --audio-format mp3 -o /sdcard/Vibe_Sound/%(title)s.%(ext)s {link}',timeout_s:300},as:'dl'},{do:'if',cond:'ok',then:[{do:'reply',text:'Vibe_Sound me save ho gaya.'}],else:[{do:'reply',text:'Download nahi hua, link ya yt-dlp check karo.'}]}]});
 ok(exm.ok,'the example from the rules text passes validation');

 console.log(fails?('\n'+fails+' FAIL'):'\nALL PASS');
 process.exit(fails?1:0);
})();
