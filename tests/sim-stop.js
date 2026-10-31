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
vm.createContext(ctx);
for(const f of ['prompts','core','status','providers','chat','settings','attach','keys','helpers','phone','tools','termux','workspace','files','notes','slash','fast','intents','termuxapi','runner','rules','log','main'])vm.runInContext(fs.readFileSync('js/'+f+'.js','utf8'),ctx,{filename:f+'.js'});
let pass=0,fail=0;const ok=(c,m)=>{if(c){pass++;console.log('PASS',m)}else{fail++;console.log('FAIL',m)}};
const run=c=>vm.runInContext(c,ctx),W=ms=>new Promise(r=>setTimeout(r,ms));
const send=async t=>{els['#in'].value=t;return handlers['#f:submit']({preventDefault(){}})};
(async()=>{
 run("S.keys.groq='k';S.prov='groq';");
 const last=()=>{const H=run('H');return H[H.length-1]};
 // 1. Stop while the AI request is still running
 mode='hang';fetches.length=0;nat.length=0;
 const p1=send('hello');await W(30);
 ok(run('busy')===true&&/rect/.test(els['#send'].innerHTML),'busy: send button turned into Stop (square icon)');
 handlers['#send:click']({preventDefault(){}});
 const t0=Date.now();await p1;
 ok(Date.now()-t0<200,'Stop ends the turn at once ('+(Date.now()-t0)+' ms)');
 ok(last().content==='Stop dabaya gaya.'&&last().info===1,'chat shows "Stop dabaya gaya."');
 ok(run('busy')===false&&/SEND/.test(els['#send'].innerHTML),'turn over: button is Send again');
 ok(fetches.length===1&&fetches[0].signal&&fetches[0].signal.aborted,'AI request aborted, no retry / no other provider');
 ok(nat.indexOf('stop')>=0,'phone side told to stop (native ScreenControl.stop)');
 ok(run('TURN')===null,'turn state cleared');
 // 2. Stop while a tool runs: no second tool, note names the running tool, no late writes
 mode='tools';n=0;fetches.length=0;nat.length=0;openDelay=150;
 script=[[tc('1','open_app',{name:'Termux'}),tc('2','screen_type',{text:'x'})],'never reached'];
 const hLen0=run('H.length');
 const p2=send('termux kholo');await W(40);
 handlers['#send:click']({preventDefault(){}});
 await p2;
 ok(/open_app/.test(last().content)&&/background/.test(last().content),'note says open_app was running and may finish in background');
 const hLen1=run('H.length');
 await W(300);
 ok(run('H.length')===hLen1,'late tool result does not touch the chat');
 ok(nat.indexOf('type')<0&&fetches.length===1,'second tool and next AI step never started');
 // 3. next message works after a stop (fresh controller)
 mode='text';n=0;fetches.length=0;script=['theek hai'];
 await send('dobara');
 ok(last().content==='theek hai'&&fetches.length===1&&!fetches[0].signal.aborted,'next message after Stop works normally');
 // 4. clicking the button when idle does not stop anything
 let stopped=false;handlers['#send:click']({preventDefault(){stopped=true}});
 ok(!stopped,'idle click does not call stop');
 console.log('\n'+pass+' pass, '+fail+' fail');process.exit(fail?1:0);
})().catch(e=>{console.error('ERR',e);process.exit(1)});
