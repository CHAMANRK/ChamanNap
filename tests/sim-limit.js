// 1.37002.0: step limit 30, last-call report at the limit, app steps in history. Run: cd www && node ../tests/sim-limit.js
const vm=require('vm'),fs=require('fs');
const els={},handlers={},html={};
const mk=sel=>{const o={value:'',style:{},dataset:{},options:[],classList:{add(){},remove(){},toggle(){}},addEventListener(t,f){handlers[sel+':'+t]=f},insertAdjacentHTML(w,h){html[sel]=(html[sel]||'')+h},querySelector(){return mk('x')},closest(){return null},appendChild(){},remove(){},select(){},click(){},set onclick(f){handlers[sel+':click']=f},set onchange(f){},scrollHeight:0,scrollTop:0,disabled:false,textContent:''};let h='';Object.defineProperty(o,'innerHTML',{get(){return h},set(v){h=v;if(sel==='#prov')o.options=v.split('<option').slice(1)}});return o};
const doc={querySelector:s=>els[s]||(els[s]=mk(s)),createElement:()=>mk('c'),body:mk('body'),documentElement:{dataset:{}}};
const store={};let n=0;const lines=[],other=[];
let pass=0,fail=0;const ok=(c,m)=>{if(c){pass++;console.log('PASS',m)}else{fail++;console.log('FAIL',m)}};
const tc=(id,name,args)=>({id,type:'function',function:{name,arguments:JSON.stringify(args)}});
// provider order: nvidia (fails 429), groq (2 keys: first fails, second works)
const tcl=(id,name,args)=>({id,type:'function',function:{name,arguments:JSON.stringify(args)}});
const calls=[];
const script=[
 {msg:{role:'assistant',content:'',reasoning_content:'Pehle screen padhni hogi.\nUske baad jawab dunga. SECRET-THOUGHT-LINE2',tool_calls:[tcl('1','screen_read',{})]}},
 {msg:{role:'assistant',content:'Ho gaya.',reasoning_content:'Ab jawab de sakta hu.'}}
];
const ctx={document:doc,localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=v}},matchMedia:()=>({matches:true,addEventListener(){}}),navigator:{},console,setTimeout:(f,ms)=>setTimeout(f,Math.min(ms,3)),clearTimeout,URL,Image:function(){},
 fetch:async(u,o)=>{calls.push({u,b:JSON.parse(o.body)});const s=script[n++];if(s.status)return{ok:false,status:s.status,text:async()=>'err',json:async()=>({})};const msg=typeof s.msg==='string'?{role:'assistant',content:s.msg}:(s.msg.role?s.msg:{role:'assistant',content:null,tool_calls:s.msg});return{ok:true,status:200,json:async()=>({choices:[{message:msg}]}),text:async()=>''}}};
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
 const reset=()=>{calls.length=0;n=0;script.length=0;ev("Object.keys(cool).forEach(k=>delete cool[k])")};
 const toolTurn=k=>({msg:[tcl('t'+k,'screen_read',{})]});
 const send=async t=>{els['#in'].value=t;await handlers['#f:submit']({preventDefault(){}})};
 ev("S.keys.groq='gsk_t1t1t1t1';S.keys.deepseek='';S.prov='groq';");
 // 1. 30 tool steps, then one last call without tools that reports
 reset();for(let k=0;k<30;k++)script.push(toolTurn(k));script.push({msg:'Followers 1.2 crore mile. Follow aur unfollow dono hua.'});
 await send('modiji ke followers batao');
 ok(ev("LOOP_MAX")===30,'limit is 30');
 ok(calls.length===31,'30 tool requests + 1 last report request: '+calls.length);
 ok(calls[30]&&calls[30].b.tool_choice==='none','last request cannot call tools (tool_choice none)');
 const lu=calls[30]&&calls[30].b.messages[calls[30].b.messages.length-1];
 ok(lu&&lu.role==='user'&&/limit ho gayi/.test(lu.content)&&/andaza mat lagao/.test(lu.content),'last request asks for a factual 3-4 line report');
 const a1=ev("H[H.length-1]");
 ok(a1&&/Followers 1\.2 crore mile/.test(a1.content)&&/limit \(30\) ho gayi/.test(a1.content),'answer = the AI report + the limit note');
 ok(a1&&a1.steps&&a1.steps.length>=30,'steps saved with the answer: '+(a1&&a1.steps&&a1.steps.length));
 // 2. next message: the AI sees the app steps of the last turn
 reset();script.push({msg:'Theek hai.'});
 await send('kya kya hua tha');
 const prev=calls[0].b.messages.find(m=>m.role==='assistant'&&/Followers 1\.2 crore/.test(m.content||''));
 ok(prev&&/\[app steps of that turn/.test(prev.content)&&/Screen padhi/.test(prev.content),'next turn: AI gets the app step list of the previous turn');
 ok(prev&&/last 15 of 30/.test(prev.content)&&(prev.content.match(/\n- /g)||[]).length===15,'only the last 15 steps are sent');
 // 3. only the last 2 turns with steps carry the list
 ev("H.length=0;for(let k=0;k<4;k++){H.push({role:'user',content:'q'+k});H.push({role:'assistant',content:'a'+k,steps:['Click: X'+k,'Screen padhi (a, 2 items)']})}H.push({role:'user',content:'q4'});");
 const am=ev("apiMsgs(false)").filter(m=>m.role==='assistant');
 ok(am.length===4&&am.filter(m=>/app steps of that turn/.test(m.content)).length===2&&/app steps/.test(am[3].content)&&/app steps/.test(am[2].content)&&!/app steps/.test(am[1].content),'steps note only on the last 2 tool turns');
 ok(!/app steps/.test(ev("apiMsgs(false)")[0].content),'system prompt untouched');
 // 4. last report fails -> old fixed line
 reset();for(let k=0;k<30;k++)script.push(toolTurn(k));script.push({status:500});
 await send('phir se');
 const a2=ev("H[H.length-1]");
 ok(a2&&a2.content==='Tool steps ki limit (30) ho gayi, kaam adhura ho sakta hai.','report call fails -> fixed limit line: '+(a2&&a2.content));
 // 5. 29 tool steps then a normal answer: no extra call
 reset();for(let k=0;k<29;k++)script.push(toolTurn(k));script.push({msg:'Ho gaya.'});
 await send('chhota kaam');
 const a3=ev("H[H.length-1]");
 ok(calls.length===30&&a3.content==='Ho gaya.'&&!calls.some(c=>c.b.tool_choice==='none'),'normal finish under the limit: no report call, no limit note');
 console.log('\n'+pass+' passed, '+fail+' failed');process.exit(fail?1:0);
})();
