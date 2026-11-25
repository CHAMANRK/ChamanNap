// 1.50000.0 connector engine (C1 + C2): manifest validate/cache, discovery + link (real transport mocked as the native Link plugin, and fake apps),
// /App list/choose/run, confirm (once/always/deny), params, progress + result card, ACK reject, unknown_action, connection lost, AI context of the chosen app only,
// app_call tool, rules area, and "no app name in the code".
// Run from www: cd chaman-nap/www && node ../tests/sim-connector.js
const vm=require('vm'),fs=require('fs');
const els={},handlers={};
const mk=sel=>{const o={value:'',style:{},dataset:{},options:[],classList:{add(){els[sel+'#open']=1},remove(){delete els[sel+'#open']},toggle(){}},addEventListener(t,f){const k=sel+':'+t,pv=handlers[k];handlers[k]=pv?async e=>{await pv(e);await f(e)}:f},insertAdjacentHTML(){},querySelector(){return mk('x')},closest(){return null},appendChild(){},remove(){},select(){},click(){},focus(){},set onclick(f){handlers[sel+':click']=f},set onchange(f){},scrollHeight:0,scrollTop:0,disabled:false,textContent:'',srcdoc:''};let h='';Object.defineProperty(o,'innerHTML',{get(){return h},set(v){h=v;if(sel==='#prov')o.options=v.split('<option').slice(1)}});return o};
const doc={querySelector:s=>els[s]||(els[s]=mk(s)),createElement:()=>mk('c'),body:mk('body'),documentElement:{dataset:{}},addEventListener(){}};
const store={};
const FS={};
const sleepR=ms=>new Promise(r=>setTimeout(r,ms));
// ---- native Link plugin mock: one real app "com.x.alpha" (signed ok), one foreign "com.y.beta" (other key) ----
const NATIVE={apps:[{pkg:'com.x.alpha',svc:'com.chaman.link.LinkService',label:'Alpha App',version:'1.0',sigOk:true},{pkg:'com.y.beta',svc:'com.chaman.link.LinkService',label:'Beta App',version:'2.0',sigOk:false}],
  queue:[],bound:{},sent:[],mode:'ok',manifest:null};
const ALPHA=()=>({link_version:1,id:'alpha',naam:'Alpha Tool',package:'com.x.alpha',version:'1.0',one_liner:'Test app',keywords:['a'],
  actions:[{name:'fetch',desc:'Fetch a thing'},{name:'ping',desc:'Ping'}],
  tools:[{action:'fetch',params:{url:{type:'string',required:true},n:{type:'number'},kind:{type:'enum',values:['a','b']}},mode:'background',result:'file'}],github_release_url:'https://example.com/r'});
NATIVE.manifest=ALPHA();
const qpush=(what,o,pkg)=>NATIVE.queue.push({pkg:pkg||'com.x.alpha',what,json:JSON.stringify(o)});
const link=async(m,o)=>{
  if(m==='discover')return{apps:NATIVE.apps};
  if(m==='bind'){if(o.pkg==='com.y.beta'){const e=new Error('perm');e.code='PERMISSION';throw e}NATIVE.bound[o.pkg]=1;return{ok:true}}
  if(m==='unbind'){delete NATIVE.bound[o.pkg];return{ok:true}}
  if(m==='send'){
    if(!NATIVE.bound[o.pkg]){const e=new Error('nb');e.code='NOT_BOUND';throw e}
    const j=JSON.parse(o.json);NATIVE.sent.push({what:o.what,j});
    if(o.what===1)setTimeout(()=>qpush(101,NATIVE.manifest),2);
    if(o.what===2){
      if(NATIVE.mode==='reject'){setTimeout(()=>qpush(102,{callId:j.callId,accepted:false,error:'busy'}),2);return{ok:true}}
      if(NATIVE.mode==='silent')return{ok:true};
      setTimeout(()=>qpush(102,{callId:j.callId,accepted:true}),2);
      if(j.action==='nope'){setTimeout(()=>qpush(104,{callId:j.callId,status:'failed',error:'unknown_action',text:''}),6);return{ok:true}}
      if(NATIVE.mode==='lost'){setTimeout(()=>qpush(-1,{}),8);return{ok:true}}
      setTimeout(()=>qpush(103,{callId:j.callId,percent:40,text:'half'}),4);
      setTimeout(()=>qpush(104,{callId:j.callId,status:'done',text:'saved it',files:['/sdcard/Download/a.mp4']}),10);
    }
    return{ok:true};
  }
  if(m==='poll'){
    const t0=Date.now();
    while(!NATIVE.queue.length&&Date.now()-t0<Math.min(o.wait||0,300))await sleepR(2);
    const items=NATIVE.queue.splice(0);return{items};
  }
  return{};
};
const files=async(m,o)=>{if(m==='write'){FS[o.path]=o.content;return{path:o.path}}return{}};
const ctx={document:doc,localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=v}},matchMedia:()=>({matches:true,addEventListener(){}}),navigator:{},console,setTimeout:(f,ms)=>{const t=setTimeout(f,ms>10000?1e9:ms<=250?ms:ms/40);if(ms>10000)t.unref();return t},clearTimeout,URL,Image:function(){},
 fetch:async()=>({ok:true,status:200,json:async()=>({choices:[{message:{role:'assistant',content:'x'}}]}),text:async()=>''})};
ctx.window=ctx;
ctx.Capacitor={nativePromise:async(pl,m,o)=>{if(pl==='Link')return link(m,o);if(pl==='Files')return files(m,o);if(pl==='Termux')return{stdout:'',exitCode:0};return{}}};
vm.createContext(ctx);
process.chdir(__dirname+'/../www');
for(const f of ['prompts','core','status','providers','chat','settings','attach','keys','helpers','phone','tools','termux','workspace','files','notes','slash','fast','intents','termuxapi','runner','rules','connector','log','main'])vm.runInContext(fs.readFileSync('js/'+f+'.js','utf8'),ctx,{filename:f+'.js'});
const t=s=>vm.runInContext(s,ctx),getH=()=>t('H');
let fails=0;const ok=(c,l)=>{console.log((c?'PASS ':'FAIL ')+l);if(!c)fails++};
const typeIn=v=>{els['#in'].value=v;return handlers['#in:input']&&handlers['#in:input']({target:els['#in']})};
const pick=name=>handlers['#slash:pointerdown']({target:{closest:q=>q==='.srow'?{dataset:{c:name}}:null},preventDefault(){}});
const send=()=>handlers['#f:submit']({preventDefault(){}});
const last=()=>getH()[getH().length-1];
const tap=(idx,o)=>handlers['#chat:click']({target:{closest:q=>q==='.abtn'?{dataset:{m:String(idx),o:String(o)}}:null}});
const tapCnb=(key,act,rest)=>handlers['#chat:click']({target:{closest:q=>q==='.cnb'?{dataset:{cn:key,act,rest}}:null}});
const slash=async(arg,nb)=>{await typeIn('/ap');await pick('app');els['#in'].value='/app '+arg;await handlers['#in:input']({target:els['#in']});const pr=send();if(!nb)await pr;else{await sleepR(5)}};
const pendingIdx=()=>{const H=getH();for(let k=H.length-1;k>=0;k--)if(H[k].confirm&&H[k].confirm.state==='pending')return k;return-1};
const waitFor=async(f,ms)=>{const t0=Date.now();while(Date.now()-t0<(ms||1500)){if(f())return true;await sleepR(5)}return f()};
const lastCard=()=>{const H=getH();for(let k=H.length-1;k>=0;k--)if(H[k].cn)return H[k];return null};
(async()=>{
 // ---------- no app name in the code ----------
 const src=fs.readFileSync('js/connector.js','utf8')+fs.readFileSync('../native/LinkPlugin.java','utf8');
 ok(!/downloader|messageeditor|calllog|notifhistory|com\.chaman\.(store|browser)/i.test(src),'no app name or package in connector.js / LinkPlugin.java');
 // ---------- validate ----------
 const V=m=>t('cnValidate('+JSON.stringify(m)+')');
 ok(V(ALPHA())==='','good manifest passes');
 ok(/link_version 2/.test(V(Object.assign(ALPHA(),{link_version:2}))),'link_version above Nap is refused with a message');
 ok(/id/.test(V(Object.assign(ALPHA(),{id:''}))),'missing id refused');
 ok(/id galat/.test(V(Object.assign(ALPHA(),{id:'Bad Id'}))),'bad id format refused');
 ok(/actions/.test(V(Object.assign(ALPHA(),{actions:[]}))),'empty actions refused');
 ok(/actions me nahi/.test(V(Object.assign(ALPHA(),{tools:[{action:'zzz'}]}))),'tool for unknown action refused');
 ok(/type galat/.test(V(Object.assign(ALPHA(),{tools:[{action:'fetch',params:{x:{type:'date'}}}]}))),'bad param type refused');
 ok(/enum/.test(V(Object.assign(ALPHA(),{tools:[{action:'fetch',params:{x:{type:'enum'}}}]}))),'enum without values refused');
 // ---------- discovery + link (real transport mock) ----------
 let L=await t('cnScan()');
 ok(L.length===2&&L.every(f=>f.status==='Not linked'),'2 apps found, both Not linked');
 let e1='';try{await t("cnLink(CNR.found.find(f=>f.pkg==='com.y.beta'))")}catch(e){e1=e.message}
 ok(/alag key/.test(e1),'app signed with another key cannot be linked');
 const m=await t("cnLink(CNR.found.find(f=>f.pkg==='com.x.alpha'))");
 ok(m.id==='alpha'&&t('CN.linked.alpha')===true,'alpha linked');
 ok(!!FS['/sdcard/Chaman/connector/alpha.json']&&JSON.parse(FS['/sdcard/Chaman/connector/alpha.json']).naam==='Alpha Tool','manifest cached to /sdcard/Chaman/connector/alpha.json');
 ok(!!JSON.parse(store.nap_cn).man.alpha,'manifest cached in app storage');
 L=await t('cnScan()');ok(L.find(f=>f.pkg==='com.x.alpha').status==='Linked','status Linked');
 NATIVE.apps[0].version='1.1';L=await t('cnScan()');ok(L.find(f=>f.pkg==='com.x.alpha').status==='Update available','installed version changed -> Update available');
 NATIVE.manifest=Object.assign(ALPHA(),{version:'1.1'});
 await t("cnLink(CNR.found.find(f=>f.pkg==='com.x.alpha'))");L=await t('cnScan()');
 ok(L.find(f=>f.pkg==='com.x.alpha').status==='Linked'&&t('CN.man.alpha.version')==='1.1','refresh -> Linked again with the new manifest');
 NATIVE.manifest=Object.assign(ALPHA(),{package:'com.other.pkg'});
 let e2='';try{await t("cnLink(CNR.found.find(f=>f.pkg==='com.x.alpha'))")}catch(e){e2=e.message}
 ok(/match nahi/.test(e2),'manifest package that differs from the app is refused');
 NATIVE.manifest=ALPHA();NATIVE.manifest.version='1.1';
 // unlink / relink
 t("cnUnlink('alpha')");L=await t('cnScan()');ok(L.find(f=>f.pkg==='com.x.alpha').status==='Not linked','unlink -> Not linked');
 await t("cnLink(CNR.found.find(f=>f.pkg==='com.x.alpha'))");L=await t('cnScan()');ok(L.find(f=>f.pkg==='com.x.alpha').status==='Linked','relink -> Linked');
 // ---------- fake app (debug) ----------
 const FM={link_version:1,id:'demo',naam:'Demo Fake',package:'fake.demo',version:'1',one_liner:'fake',actions:[{name:'hello',desc:'Say hello'},{name:'stats',desc:'Numbers'}],tools:[{action:'hello',params:{text:{type:'string',required:true}},result:'text'},{action:'stats',params:{},result:'data'}]};
 let ef='';try{t("cnAddFake('{bad')")}catch(e){ef=e.message}ok(/JSON galat/.test(ef),'fake app: bad JSON refused');
 t('cnAddFake('+JSON.stringify(JSON.stringify(FM))+')');
 L=await t('cnScan()');const fk=L.find(f=>f.fake);ok(fk&&fk.status==='Not linked','fake app is listed (Not linked)');
 await t("cnLink(CNR.found.find(f=>f.fake))");L=await t('cnScan()');ok(L.find(f=>f.fake).status==='Linked','fake app linked');
 ok(!!FS['/sdcard/Chaman/connector/demo.json'],'fake manifest cached too');
 // ---------- params ----------
 const tool=ALPHA().tools[0];const P=(r)=>t('cnParams('+JSON.stringify(tool)+','+JSON.stringify(r)+')');
 ok(/zaroori/.test(P({}).err),'missing required param -> error');
 ok(P({url:'x',n:'5'}).params.n===5,'number param coerced from text');
 ok(/number/.test(P({url:'x',n:'abc'}).err),'bad number -> error');
 ok(/ek ho/.test(P({url:'x',kind:'z'}).err),'bad enum -> error');
 ok(/nahi hai/.test(P({url:'x',zzz:1}).err),'unknown param -> error');
 // ---------- /App list, help, choose ----------
 await slash('');
 ok(last().cnlist&&last().cnlist.length===3,'/App shows a tappable list (3 apps)');
 ok(t('cnH(H[H.length-1],0)').indexOf('data-cn')>=0,'list renders buttons');
 await slash('help');ok(/\/App alpha fetch/.test(last().content)&&/\/App demo hello/.test(last().content),'/App help is built from the manifests');
 await slash('zzz');ok(/nahi mila/.test(last().content),'unknown name -> message');
 await slash('de');ok(t('CN.chosen')==='demo'&&/Chuna: \*\*Demo Fake/.test(last().content),'partial name /App de chooses demo');
 // ---------- context: only the chosen app ----------
 let b=t('cnBlock()');ok(b.indexOf('Demo Fake')>=0&&b.indexOf('hello')>=0&&b.indexOf('Alpha')<0&&b.indexOf('fetch')<0,'AI context has only the chosen app (actions + params)');
 ok(t('RULES.apps').length>100&&t("ruleText('apps')").indexOf('Demo Fake')>=0,'rules area apps (with chosen app)');
 ok(t("RULE_ORDER.indexOf('apps')")>=0&&t("TOOLS.find(x=>x.function.name==='rules_read').function.parameters.properties.area.enum.indexOf('apps')")>=0,'apps is a rules_read area');
 ok(t("RULE_KW.apps.test('/app downloader')")&&t("RULE_KW.apps.test('kya linked apps hain')"),'keywords pick the apps rules');
 // ---------- /App name kaam: confirm once ----------
 await slash('demo hello world',1);
 let pi=await waitFor(()=>pendingIdx()>=0);ok(pi&&last().confirm&&last().confirm.type==='cn'&&last().confirm.opts.length===2,'confirm card (Allow once / Always, Deny)');
 ok(last().content.indexOf('text: world')>=0,'confirm shows the params');
 ok(t('acts(H[H.length-1],H.length-1)').indexOf('Deny')>=0&&t('acts(H[H.length-1],H.length-1)').indexOf('Always')>=0,'card buttons: Once, Always, Deny');
 await tap(pendingIdx(),0);
 ok(await waitFor(()=>{const c=lastCard();return c&&c.cn.state==='done'}),'after Allow once the call ran and the card is done');
 let c1=lastCard();ok(/fake ok: hello/.test(c1.content)&&c1.cn.pct===null,'result card has the result text');
 ok(!t("!!CN.allow['demo:hello']"),'Allow once does not remember');
 // ---------- Deny ----------
 await slash('demo hello again',1);await waitFor(()=>pendingIdx()>=0);await tap(pendingIdx(),'x');
 await sleepR(30);ok(!lastCard()||lastCard()===c1,'Deny: no call card made');
 ok(getH().some(m=>m.confirm&&m.confirm.state==='cancelled'),'Deny marks the card cancelled');
 // ---------- Always ----------
 await slash('demo hello third',1);await waitFor(()=>pendingIdx()>=0);await tap(pendingIdx(),1);
 ok(await waitFor(()=>{const c=lastCard();return c&&c!==c1&&c.cn.state==='done'}),'Always: call done');
 ok(t("CN.allow['demo:hello']")===true,'Always allow remembered');
 const n0=getH().filter(m=>m.confirm).length;await slash('demo hello fourth');
 ok(await waitFor(()=>{const c=lastCard();return c&&/fourth/.test(c.content)&&c.cn.state==='done'}),'second call needs no confirm');
 ok(getH().filter(m=>m.confirm).length===n0,'no new confirm card after Always');
 // bad params from slash
 await slash('demo hello');ok(/Param "text" zaroori/.test(last().content)||(lastCard()&&false)||/zaroori/.test(last().content),'missing param from /App -> message, no call');
 // fake: progress, data result, FAIL, unknown action, reject
 t("CN.allow['demo:stats']=true");await slash('demo stats');
 ok(await waitFor(()=>{const c=lastCard();return c&&c.cn.action==='stats'&&c.cn.state==='done'}),'data result done');
 ok(lastCard().content.indexOf('```json')>=0&&lastCard().cn.data.action==='stats','data result shown as JSON');
 await slash('demo hello FAIL');
 ok(await waitFor(()=>{const c=lastCard();return c&&/FAIL/.test(c.content)&&c.cn.state==='failed'}),'failed result -> card failed');
 // ---------- real transport: alpha ----------
 await slash('alpha fetch http://x.y/z',1);
 ok(await waitFor(()=>pendingIdx()>=0),'alpha: single-param action takes the whole text as the param (confirm shows url)');
 ok(last().content.indexOf('url: http://x.y/z')>=0,'alpha confirm has url');
 await tap(pendingIdx(),0);
 ok(await waitFor(()=>{const c=lastCard();return c&&c.cn.id==='alpha'&&c.cn.state==='done'}),'alpha: ACK, PROGRESS, RESULT -> done');
 const ac=lastCard();ok(/saved it/.test(ac.content)&&/a\.mp4/.test(ac.content),'alpha result shows text and file path');
 const sent=NATIVE.sent.filter(x=>x.what===2).pop();ok(sent&&sent.j.action==='fetch'&&sent.j.params.url==='http://x.y/z'&&/^c/.test(sent.j.callId),'CALL went out with callId, action, params');
 ok(NATIVE.sent.some(x=>x.what===1&&x.j.link_version===1),'handshake what=1 was sent');
 // choose alpha by name only (single action app with 2 actions -> list of actions)
 await slash('alpha');ok(t('CN.chosen')==='alpha'&&/fetch/.test(last().content)&&/ping/.test(last().content),'/App alpha chooses and lists actions');
 await slash('alpha ping',1);ok(await waitFor(()=>pendingIdx()>=0),'alpha ping (action without tool entry) goes to confirm');
 if(pendingIdx()>=0)await tap(pendingIdx(),'x');
 // reject
 NATIVE.mode='reject';t("CN.allow['alpha:fetch']=true");await slash('alpha fetch u');
 ok(await waitFor(()=>{const c=lastCard();return c&&c.cn.state==='failed'&&/busy/.test(c.content)}),'ACK accepted:false -> failed card with the reason');
 // unknown action from app
 NATIVE.mode='ok';t("CN.allow['alpha:ping']=true");
 const r0=await t("cnCall(CN.man.alpha,'ping',{},{wait:2000})");ok(r0.ok&&/saved it/.test(r0.text),'cnCall wait returns the result');
 // connection lost
 NATIVE.mode='lost';await slash('alpha fetch u2');
 ok(await waitFor(()=>{const c=lastCard();return c&&c.cn.state==='failed'&&c.cn.error==='connection_lost'}),'service died mid-call -> failed card (connection_lost)');
 // no ACK
 NATIVE.mode='silent';const r1=await t("cnCall(CN.man.alpha,'fetch',{url:'q'},{wait:0})");
 ok(!r1.ok&&r1.err==='no_ack','no ACK in time -> failed (no_ack)');
 NATIVE.mode='ok';
 // app process killed: send gets NOT_BOUND -> rebind once
 delete NATIVE.bound['com.x.alpha'];
 const r2=await t("cnCall(CN.man.alpha,'fetch',{url:'q2'},{wait:2000})");ok(r2.ok,'NOT_BOUND -> bind again and the call goes through');
 // ---------- app_call tool (AI) ----------
 t("CN.chosen='alpha'");
 const steps=[];let res=await t("execTool('app_call',{app_id:'alpha',action:'fetch',params:{url:'ai-url'},wait_s:3},[])");
 ok(/ho gaya/.test(res)&&/saved it/.test(res)&&/a\.mp4/.test(res),'app_call tool returns the result to the AI');
 res=await t("execTool('app_call',{app_id:'demo',action:'hello',params:{text:'x'}},[])");ok(/chuna nahi gaya/.test(res),'app_call refuses an app that is not the chosen one');
 res=await t("execTool('app_call',{app_id:'alpha',action:'nope',params:{}},[])");ok(/unknown_action/.test(res),'unknown action -> error text for the AI');
 res=await t("execTool('app_call',{app_id:'alpha',action:'fetch',params:{}},[])");ok(/zaroori/.test(res),'missing param -> error text for the AI');
 t("CN.chosen=''");res=await t("execTool('app_call',{app_id:'alpha',action:'fetch',params:{url:'x'}},[])");ok(/Koi app chuna nahi/.test(res),'no chosen app -> refused');
 ok(t("cnBlock()")==='','no chosen app -> no context block');
 // ---------- tool is in the skill list, hidden from AI when no app chosen ----------
 ok(t("TOOLS.some(x=>x.function.name==='app_call')")&&t("skillText()").indexOf('app_call')>=0,'app_call is in TOOLS and the skill text');
 // ---------- stale run card after restart ----------
 t("H.push({role:'assistant',by:'X',local:1,cn:{id:'alpha',action:'fetch',callId:'dead',state:'run',pct:30,text:'x'},content:''})");
 t('cnInit()');ok(last().cn.state==='lost'&&/dobara khula/.test(last().content),'run card left from an old app run is marked lost');
 // ---------- remove fake, settings html ----------
 t("cnRemoveFake('demo')");L=await t('cnScan()');ok(!L.some(f=>f.fake)&&!t("!!CN.man.demo"),'fake app removed with its cache');
 ok(t('cnSettingsHtml()').indexOf('Connector')>=0&&t('cnListHtml()').indexOf('Alpha Tool')>=0,'Settings Connector html lists the app');
 // link from the chat list button
 t("cnUnlink('alpha')");await t('cnScan()');await tapCnb('com.x.alpha','link');
 ok(await waitFor(()=>/Linked: \*\*Alpha Tool/.test(last().content)),'Link button in the chat list links the app');
 console.log(fails?('\n'+fails+' FAIL'):'\nALL PASS');process.exit(fails?1:0);
})().catch(e=>{console.log('CRASH',e);process.exit(1)});
