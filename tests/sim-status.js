// step18: status line. Run: cd www && node ../tests/sim-status.js
const vm=require('vm'),fs=require('fs');
const els={},handlers={},html={};
const mk=sel=>{const o={value:'',style:{},dataset:{},options:[],classList:{add(){},remove(){},toggle(){}},addEventListener(t,f){handlers[sel+':'+t]=f},insertAdjacentHTML(w,h){html[sel]=(html[sel]||'')+h},querySelector(){return mk('x')},closest(){return null},appendChild(){},remove(){},select(){},click(){},set onclick(f){handlers[sel+':click']=f},set onchange(f){},scrollHeight:0,scrollTop:0,disabled:false,textContent:''};let h='';Object.defineProperty(o,'innerHTML',{get(){return h},set(v){h=v;if(sel==='#prov')o.options=v.split('<option').slice(1)}});return o};
const doc={querySelector:s=>els[s]||(els[s]=mk(s)),createElement:()=>mk('c'),body:mk('body'),documentElement:{dataset:{}}};
const store={};let n=0;const lines=[],other=[];
let pass=0,fail=0;const ok=(c,m)=>{if(c){pass++;console.log('PASS',m)}else{fail++;console.log('FAIL',m)}};
const tc=(id,name,args)=>({id,type:'function',function:{name,arguments:JSON.stringify(args)}});
// provider order: nvidia (fails 429), groq (2 keys: first fails, second works)
const script=[
 {status:429},
 {status:500},
 {msg:[tc('1','screen_type',{text:'MERA-SECRET-123'}),tc('2','send_sms',{contact:'Rahul',text:'SMS-BODY-XYZ'}),tc('3','open_url',{uri:'https://wa.me/{number}?text={text}',contact:'Rahul',text:'LINK-TEXT-ABC',app:'com.whatsapp'}),tc('4','screen_read',{}),tc('5','ask_user',{message:'Yahan tap karo',after:'Ok'})]},
 {msg:'Ho gaya.'}
];
const ctx={document:doc,localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=v}},matchMedia:()=>({matches:true,addEventListener(){}}),navigator:{},console,setTimeout:(f,ms)=>setTimeout(f,Math.min(ms,3)),clearTimeout,URL,Image:function(){},
 fetch:async()=>{const s=script[n++];if(s.status)return{ok:false,status:s.status,text:async()=>'err',json:async()=>({})};const msg=typeof s.msg==='string'?{role:'assistant',content:s.msg}:{role:'assistant',content:null,tool_calls:s.msg};return{ok:true,status:200,json:async()=>({choices:[{message:msg}]}),text:async()=>''}}};
ctx.window=ctx;
let acts=0,polls=0;
ctx.Capacitor={nativePromise:async(pl,m,o)=>{
 if(m==='line')lines.push(o);else if(m!=='activity'&&m!=='read'&&m!=='reset')other.push({m,o});
 if(m==='read')return{pkg:'com.whatsapp',items:[{i:0,k:'T',t:'Chats'},{i:1,k:'T',t:'Rahul'}]};
 if(m==='type')return{};
 if(m==='findContact')return{matches:[{name:'Rahul',number:'98765 43210'}]};
 if(m==='openUrl')return{};
 if(m==='activity'){polls++;if(polls>3)acts=1;return{count:acts,kbd:false,done:false,stop:false}}
 if(m==='line')return{ok:true};
 return{}}};
vm.createContext(ctx);
for(const f of ['prompts','core','status','providers','chat','settings','attach','keys','helpers','phone','tools','termux','workspace','files','notes','slash','fast','intents','termuxapi','runner','rules','log','main'])vm.runInContext(fs.readFileSync('js/'+f+'.js','utf8'),ctx,{filename:f+'.js'});
const ev=c=>vm.runInContext(c,ctx);
(async()=>{
 ev("S.keys.nvidia='k1';S.keys.groq='g1,g2';S.prov='auto';");
 els['#in'].value='kuch karo';
 await handlers['#f:submit']({preventDefault(){}});
 const texts=lines.map(l=>l.text||''),all=JSON.stringify(lines)+JSON.stringify(other.filter(x=>x.m==='pill'));
 ok(lines[0]&&lines[0].text==='Message bhej raha hu'&&lines[0].state==='wait','line starts when the message is sent');
 ok(texts.some(t=>/NVIDIA se jawab ka wait/.test(t)),'shows which provider we wait for');
 ok(texts.some(t=>/NVIDIA fail \(HTTP \d+\), Groq try kar raha hu/.test(t)),'shows provider shift with reason: '+texts.find(t=>/fail/.test(t)));
 ok(texts.some(t=>/Groq: dusri key try/.test(t)),'shows key switch');
 ok(texts.some(t=>t==='Screen padh raha hu'),'tool label written by the app');
 ok(!/MERA-SECRET-123/.test(all),'typed text never in line or pill');
 ok(!/SMS-BODY-XYZ/.test(all),'sms text never in line');
 ok(!/LINK-TEXT-ABC/.test(all)&&!/98765/.test(all)&&!/wa\.me/.test(all),'link text, number, uri never in line');
 const typed=lines.filter(l=>l.items).map(l=>JSON.parse(l.items)).flat().find(x=>/Type kar raha/.test(x[0])&&x[1]==='ok');
 ok(typed&&typed[2]==='Type kiya (15 char)','typed result is only a char count: '+(typed&&typed[2]));
 const sr=lines.filter(l=>l.items).map(l=>JSON.parse(l.items)).flat().find(x=>x[0]==='Screen padh raha hu'&&x[1]==='ok');
 ok(sr&&sr[2]==='2 items','screen_read result is item count: '+(sr&&sr[2]));
 // ask_user: native line must stay quiet while the ask overlay owns the pill
 const ia=other.findIndex(x=>x.m==='pill'&&x.o.mode==='ask'&&x.o.state==='wait'),ib=other.findIndex((x,i)=>i>ia&&x.m==='pill'&&x.o.mode==='ask'&&x.o.state==='ok');
 ok(ia>=0&&ib>ia,'ask overlay shown ('+ia+','+ib+')');
 const seq=[];let oi=0;
 ok(lines[lines.length-1].off===true,'last native call is {off:true} (line removed when the answer is ready)');
 ok(other.some(x=>x.m==='finish'&&x.o.open===false)||other.some(x=>x.m==='finish'),'finish called at the end');
 ok(ev('LN.on')===false,'status off after the answer');
 const tl=ev("JSON.stringify(TOOLS)");
 ok(!/"status"/.test(tl),'tool schema has no status field for the AI');
 // chat drawing
 ev("busy=true;lnBegin('Test','wait');lnStep('open_app',{name:'WhatsApp'});");
 const h1=ev("lnHtml(true)");
 ok(/lnd run/.test(h1)&&/lnt rl/.test(h1)&&/lnk/.test(h1)&&!/lnx/.test(h1),'collapsed: dot + rolling text + arrow, no list');
 ev("LN.open=true");
 const h2=ev("lnHtml(false)");
 ok(/lnx/.test(h2)&&/lni/.test(h2)&&/lnk o/.test(h2),'expanded: list + rotated arrow');
 ev("lnStepEnd(LN.items[0],'open_app',{name:'WhatsApp'},false,'x','WhatsApp khul gaya.')");
 ok(/lnr">WhatsApp khul gaya\./.test(ev("lnHtml(false)")),'result line shown under the step');
 ev("for(let i=0;i<12;i++)lnStep('torch',{state:'on'})");
 ok((ev("lnHtml(false)").match(/class="lni"/g)||[]).length===8,'list shows only latest 8 steps');
 ev("LN.state='wait';LN.tw=Date.now()-12000;LN.text='Groq se jawab ka wait'");
 ok(/\s1[12]s$/.test(ev("lnShow()")),'waiting shows seconds: '+ev("lnShow()"));
 ev("busy=false;lnEnd()");
 // confirm wait text
 ev("busy=true;lnBegin('x','run');lnStep('termux_run',{command:'rm -rf /tmp/x'});");
 ev("tconfirm('Termux','rm -rf /tmp/x',['rm'],'Chalao')");
 ok(ev("LN.text")==='Tumhare confirm ka wait'&&ev("LN.state")==='wait','confirm card shows waiting state');
 ok(!/rm -rf/.test(JSON.stringify(lines.slice(-4))),'command not shown in line');
 ev("busy=false;lnEnd()");
 console.log(fail?'\nSOME FAILED: '+fail:'\nALL PASS ('+pass+')');
 process.exit(fail?1:0);
})().catch(e=>{console.error('ERR',e);process.exit(1)});
