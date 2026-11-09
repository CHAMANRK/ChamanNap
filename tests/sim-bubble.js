// step26: floating mini Chaman (bubble). Run: cd www && node ../tests/sim-bubble.js
const vm=require('vm'),fs=require('fs');
let pass=0,fail=0;const ok=(c,m)=>{if(c){pass++;console.log('PASS',m)}else{fail++;console.log('FAIL',m)}};
const handlers={},els={};
const add=(sel,t,f)=>{(handlers[sel+':'+t]=handlers[sel+':'+t]||[]).push(f)};
const mk=sel=>{const o={value:'',style:{},dataset:{},options:[],classList:{add(){},remove(){},toggle(){}},addEventListener(t,f){add(sel,t,f)},insertAdjacentHTML(){},querySelector(){return mk('x')},closest(){return null},appendChild(){},remove(){},select(){},click(){},set onclick(f){add(sel,'click',f)},set onchange(f){},scrollHeight:0,scrollTop:0,disabled:false,textContent:'',
  dispatchEvent(e){(handlers[sel+':'+e.type]||[]).forEach(f=>f({type:e.type,preventDefault(){},target:o}))}};
  let h='';Object.defineProperty(o,'innerHTML',{get(){return h},set(v){h=v;if(sel==='#prov')o.options=v.split('<option').slice(1)}});return o};
let ctx;
const btnFor=(m,o)=>{
  const H=vm.runInContext('H',ctx),x=H[m];
  if(!x||!x.confirm||x.confirm.state!=='pending')return null;
  if(o!=='x'&&!(x.confirm.opts||[])[+o])return null;
  return{dataset:{m:String(m),o:String(o)},click(){(handlers['#chat:click']||[]).forEach(f=>f({target:{closest:s=>s==='.abtn'?this:null}}))}};
};
const doc={querySelector:s=>{
  const m=/^\.abtn\[data-m="(\d+)"\]\[data-o="([0-9x]+)"\]$/.exec(s);
  if(m)return btnFor(+m[1],m[2]);
  return els[s]||(els[s]=mk(s))},createElement:()=>mk('c'),body:mk('body'),documentElement:{dataset:{}},hidden:false,addEventListener(){}};
const store={};
const tc=(id,name,args)=>({id,type:'function',function:{name,arguments:JSON.stringify(args)}});
let script=[],n=0,slow=null,hold=false;
const calls=[];let queue=[];
ctx={document:doc,localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=v}},matchMedia:()=>({matches:true,addEventListener(){}}),navigator:{},console,
  setTimeout:(f,ms)=>{const t=setTimeout(f,hold?ms:Math.min(ms,3));if(hold&&t.unref)t.unref();return t},clearTimeout,setInterval,clearInterval,URL,Image:function(){},
  Event:class{constructor(t,o){this.type=t;Object.assign(this,o||{})}},
  fetch:async()=>{
    if(slow){await slow}
    const s=script[n++]||{msg:'(sim: script khatam)'};
    if(s.status)return{ok:false,status:s.status,text:async()=>'err',json:async()=>({})};
    const msg=typeof s.msg==='string'?{role:'assistant',content:s.msg}:{role:'assistant',content:null,tool_calls:s.msg};
    return{ok:true,status:200,json:async()=>({choices:[{message:msg}]}),text:async()=>''}}};
ctx.window=ctx;
ctx.Capacitor={nativePromise:async(pl,m,o)=>{
  calls.push({pl,m,o});
  if(m==='bubble')return{ok:true,a11y:true,overlay:true};
  if(m==='bubblePoll'){const e=queue;queue=[];return{events:e.map(x=>JSON.stringify(x))}}
  if(m==='findContact')return{matches:[{name:'Rahul',number:'98765 43210'}]};
  if(m==='sendSms')return{};
  if(m==='activity')return{count:0,kbd:false,done:false,stop:false};
  return{}}};
vm.createContext(ctx);
for(const f of ['prompts','core','status','providers','chat','settings','attach','keys','helpers','phone','tools','termux','workspace','files','notes','slash','fast','intents','termuxapi','runner','rules','log','bubble','main'])vm.runInContext(fs.readFileSync('js/'+f+'.js','utf8'),ctx,{filename:f+'.js'});
const ev=c=>vm.runInContext(c,ctx);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const idle=async()=>{for(let i=0;i<200&&ev('busy');i++)await sleep(5);await sleep(10)};
const last=m=>calls.filter(c=>c.m===m).pop();
const all=m=>calls.filter(c=>c.m===m);

(async()=>{
  ev("S.keys.groq='g1';S.prov='groq';");
  // ---- switch ----
  ok(ev('bubOn()')===false,'off by default');
  ev("S.bub={on:true};bubApply()");await sleep(20);
  ok(last('bubble')&&last('bubble').o.on===true,'bubble(on) sent to native');
  ok(ev('BUB.ok')===true&&ev('bubLive()')===true,'live after native says accessibility is on');
  ok(ev('!!BUB.tm'),'poll timer running');

  // ---- send from the panel = normal send path ----
  script=[{msg:'Torch chala di.'}];n=0;calls.length=0;
  ev("els_in=document.querySelector('#in');");
  els['#in'].value='half typed';
  queue=[{type:'send',text:'torch chalao'}];
  await ev('bubPoll()');await idle();
  const H=ev('H.map(x=>({role:x.role,content:x.content}))');
  ok(H.some(x=>x.role==='user'&&x.content==='torch chalao'),'panel text became a normal user message');
  ok(H.some(x=>x.role==='assistant'&&x.content==='Torch chala di.'),'normal agent loop answered');
  ok(els['#in'].value==='half typed','text already typed in the app input is kept');
  const ans=last('bubbleAnswer');
  ok(ans&&ans.o.text==='Torch chala di.'&&ans.o.open===true,'answer goes to the panel and opens it (turn started from panel)');
  const fin=all('finish').pop();
  ok(fin&&fin.o&&fin.o.quiet===true&&fin.o.open===false,'panel turn: finish is quiet, Chaman not pulled to front: '+JSON.stringify(fin&&fin.o));
  ok(!all('finish').some(c=>!c.o||c.o.open!==false),'no finish that opens Chaman during a panel turn');
  ok(ev('BUB.from')===false,'panel flag cleared after the turn');
  ok(all('line').length>0,'status line still flows to native (it becomes the bubble header)');

  // ---- normal chat turn: answer is stored, panel not forced open ----
  script=[{msg:'Haan ji.'}];n=0;calls.length=0;
  els['#in'].value='namaste';
  await handlers['#f:submit'][0]({preventDefault(){}});await idle();
  const a2=last('bubbleAnswer');
  ok(a2&&a2.o.text==='Haan ji.'&&a2.o.open===false,'turn from the app: answer sent but panel not forced open');
  ok(!all('finish').some(c=>c.o&&c.o.quiet),'turn from the app: normal finish (not quiet)');

  // ---- busy: second send is refused politely ----
  hold=true;let release;slow=new Promise(r=>{release=r});script=[{msg:'Dheere jawab.'}];n=0;calls.length=0;
  queue=[{type:'send',text:'pehla kaam'}];await ev('bubPoll()');await sleep(10);
  ok(ev('busy')===true,'first panel message is running');
  queue=[{type:'send',text:'doosra'}];await ev('bubPoll()');await sleep(10);
  ok(/Pehla kaam chal raha hai/.test((last('bubbleAnswer')||{o:{}}).o.text||''),'second send while busy: told to wait or Stop');
  ok(!ev('H').some(x=>x.content==='doosra'),'second message was not sent');
  // ---- stop from the panel ----
  queue=[{type:'stop'}];await ev('bubPoll()');await sleep(20);
  ok(all('stop').length===1,'Stop from the panel reaches native stop flag');
  ok(ev('H').some(x=>/Stop dabaya gaya/.test(x.content||'')),'turn ended with the normal Stop note');
  release();slow=null;hold=false;await idle();

  // ---- confirm card: sms ----
  script=[{msg:[tc('1','send_sms',{contact:'Rahul',text:'kal milte hain'})]},{msg:'Card dikha diya.'}];n=0;calls.length=0;
  queue=[{type:'send',text:'Rahul ko sms bhejo kal milte hain'}];await ev('bubPoll()');await idle();
  const cards=all('bubbleCard').filter(c=>c.o.card);
  ok(cards.length>=1,'confirm card reaches the panel');
  const card=JSON.parse(cards[cards.length-1].o.card);
  ok(/SMS bhejna hai/.test(card.title),'card title: '+card.title);
  ok(/Rahul/.test(card.body)&&/kal milte hain/.test(card.body)&&!/```/.test(card.body),'card body has who + text, no fences: '+JSON.stringify(card.body));
  ok(card.btns.length===2&&card.btns[0].l==='Bhejo'&&card.btns[0].o==='0'&&card.btns[1].o==='x','buttons: Bhejo + Cancel');
  ok(card.body.length<=320,'body is compact');
  ok(ev('H['+card.m+'].confirm.state')==='pending','card points at the pending chat card');
  const sa=ans=>last('bubbleAnswer');
  queue=[{type:'confirm',m:card.m,o:'0'}];await ev('bubPoll()');await sleep(30);
  ok(all('sendSms').length===1&&all('sendSms')[0].o.text==='kal milte hain','Allow in the panel sent the SMS through the normal handler');
  ok(ev('H['+card.m+'].confirm.state')==='done','chat card is marked done too');
  ok(last('bubbleCard').o.card==='','card removed from the panel after the answer');

  // ---- confirm card: cancel ----
  script=[{msg:[tc('1','send_sms',{contact:'Rahul',text:'dobara'})]},{msg:'ok'}];n=0;calls.length=0;
  queue=[{type:'send',text:'phir bhejo'}];await ev('bubPoll()');await idle();
  const c2=JSON.parse(all('bubbleCard').filter(c=>c.o.card).pop().o.card);
  queue=[{type:'confirm',m:c2.m,o:'x'}];await ev('bubPoll()');await sleep(30);
  ok(all('sendSms').length===0,'Cancel in the panel sends nothing');
  ok(ev('H['+c2.m+'].confirm.state')==='cancelled','chat card cancelled');
  queue=[{type:'confirm',m:c2.m,o:'0'}];await ev('bubPoll()');await sleep(10);
  ok(all('sendSms').length===0,'a second tap on an old card does nothing');

  // ---- confirm wait (termux style): no pull to front while the panel is live ----
  calls.length=0;hold=true;
  const pr=ev("tconfirm('Termux command chalani hai','rm -rf tmp',['files delete'],'','Termux')");
  await sleep(10);
  ok(!all('finish').some(c=>c.o&&c.o.quiet),'tconfirm with live panel does not bring Chaman to front');
  const tcard=JSON.parse(all('bubbleCard').filter(c=>c.o.card).pop().o.card);
  ok(/Termux command/.test(tcard.title)&&/rm -rf tmp/.test(tcard.body)&&tcard.btns[0].l==='Chalao','termux card: title, command, Chalao');
  queue=[{type:'confirm',m:tcard.m,o:'0'}];await ev('bubPoll()');
  ok(await pr===true,'Allow in the panel resolves the waiting tool with true');
  // panel off: old behaviour
  ev("S.bub={on:false};bubApply()");await sleep(20);
  ok(last('bubble').o.on===false&&ev('!BUB.tm')&&ev('bubLive()')===false,'switch off: native told, timer stopped');
  calls.length=0;
  const pr2=ev("tconfirm('Termux','ls',['x'],'','Termux')");await sleep(10);
  ok(all('finish').some(c=>c.o&&c.o.quiet),'switch off: old behaviour (Chaman comes to front for the confirm)');
  ok(all('bubbleCard').length===0,'switch off: nothing sent to the panel');
  ev("TCONF[Object.keys(TCONF)[0]](false)");await pr2;hold=false;

  // ---- native structure ----
  const J=f=>fs.readFileSync('../native/'+f,'utf8');
  const bj=J('ChamanBubble.java'),sv=J('ChamanAccessibilityService.java'),pl=J('ScreenControlPlugin.java'),pa=fs.readFileSync('../scripts/patch-android.js','utf8');
  const bal=src=>{let s=src.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'').replace(/"(\\.|[^"\\])*"/g,'""');const st=[];const pair={')':'(',']':'[','}':'{'};for(const ch of s){if('([{'.includes(ch))st.push(ch);else if(')]}'.includes(ch)){if(st.pop()!==pair[ch])return false}}return st.length===0};
  ok(bal(bj)&&bal(sv)&&bal(pl),'Java brackets balanced (bubble, service, plugin)');
  ok(/ChamanBubble\.java/.test(pa),'patch-android.js copies ChamanBubble.java');
  ok(/IDLE_MS = 5000/.test(bj)&&/A_DIM = 0\.25f/.test(bj),'idle 5 s, dim 25%');
  ok(/prefs\.getInt\("side", 0\)/.test(bj)&&/prefs\.getFloat\("yf", 0\.5f\)/.test(bj),'default place: left, middle');
  ok(/private void snap\(\)/.test(bj)&&/putFloat\("yf"/.test(bj),'drag snaps to the side edge and remembers the place');
  ok(/NO_HIDE_DESCENDANTS/.test(bj),'bubble hidden from accessibility reads (AI never reads or taps it)');
  ok(/FLAG_NOT_FOCUSABLE/.test(bj)&&/setWinFocusable/.test(bj)&&/onWindowFocusChanged/.test(bj),'panel focusable only while typing');
  ok(/ChamanBubble\.active/.test(sv)&&/bubble\.setStatus/.test(sv)&&/bubble\.statusEnd/.test(sv),'service: status line feeds the bubble when it is on');
  ok(['bubble','bubbleAnswer','bubbleCard','bubblePoll'].every(m=>new RegExp('public void '+m+'\\(PluginCall').test(pl)),'plugin has bubble, bubbleAnswer, bubbleCard, bubblePoll');
  ok(/handleOnDestroy/.test(pl),'plugin clears the flag when the app is destroyed');
  const st=fs.readFileSync('js/status.js','utf8'),idx=fs.readFileSync('index.html','utf8');
  ok(idx.indexOf('js/bubble.js')>idx.indexOf('js/face.js')&&idx.indexOf('js/bubble.js')<idx.indexOf('js/main.js'),'index.html loads bubble.js before main.js');

  console.log('\n'+pass+' pass, '+fail+' fail');process.exit(fail?1:0);
})().catch(e=>{console.log('SIM ERROR',e);process.exit(2)});
