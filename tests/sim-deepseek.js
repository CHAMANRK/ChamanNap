// 1.37000.0: DeepSeek provider. Run: cd www && node ../tests/sim-deepseek.js
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
 const DK='sk-'+'a1b2c3d4'.repeat(4);
 // 1. DeepSeek is first in auto order and is used with thinking on
 ev("S.keys.deepseek='"+DK+"';S.keys.groq='gsk_g1g1g1g1';S.prov='auto';");
 ok(ev("provOrder()[0].id")==='deepseek','auto order: DeepSeek first');
 ok(ev("provOrder()[1].id")==='groq','auto order: Groq second');
 els['#in'].value='screen dekho';
 await handlers['#f:submit']({preventDefault(){}});
 ok(calls.length===2,'two requests (tool turn + final): '+calls.length);
 ok(calls[0]&&calls[0].u==='https://api.deepseek.com/chat/completions','request goes to the DeepSeek chat endpoint');
 ok(calls[0].b.model==='deepseek-flash','default model deepseek-flash');
 ok(calls[0].b.thinking&&calls[0].b.thinking.type==='enabled','thinking is on');
 ok(calls[0].b.max_tokens===8192,'max_tokens leaves room for thinking: '+calls[0].b.max_tokens);
 ok(Array.isArray(calls[0].b.tools)&&calls[0].b.tools.length>5,'function tools still sent');
 const am=calls[1]&&calls[1].b.messages.find(m=>m.role==='assistant'&&m.tool_calls);
 ok(am&&/Pehle screen padhni hogi/.test(am.reasoning_content||''),'reasoning_content of the tool turn is passed back (else DeepSeek returns 400)');
 const last=ev("H[H.length-1]");
 ok(last&&last.content==='Ho gaya.'&&/DeepSeek/.test(last.by||''),'answer shown, by DeepSeek: '+(last&&last.by));
 ok(!/reasoning|Pehle screen padhni/.test(JSON.stringify(ev("H"))),'thinking is not saved in the chat history');
 ok(!/Pehle screen padhni|SECRET-THOUGHT/.test(JSON.stringify(lines)+JSON.stringify(other)),'thinking never goes to the phone overlay or native calls');
 // 2. thinking line: first line only, chat only
 ev("busy=true;lnBegin('Test','wait');lnThink('**Pehle** screen padhni hogi.\\nSECOND-LINE-HIDDEN');");
 const h1=ev("lnHtml(false)");
 ok(/class="lnth"/.test(h1)&&/Pehle screen padhni hogi/.test(h1),'chat status shows the first thinking line');
 ok(!/SECOND-LINE-HIDDEN/.test(h1)&&!/\*\*/.test(h1),'only the first line, markdown stars removed');
 ev("lnThink('x'.repeat(300))");ok(ev("LN.th.length")<=70,'long thinking line is cut: '+ev("LN.th.length"));
 ev("lnEnd();busy=false;lnBegin('Naya','wait');");ok(ev("LN.th")==='','thinking line cleared for a new message');
 ev("lnEnd();busy=false;");
 // 3. other providers: no thinking field, no reasoning_content echoed
 calls.length=0;n=0;
 script.length=0;
 script.push({msg:{role:'assistant',content:'',reasoning_content:'OTHER-REASON',tool_calls:[tcl('1','screen_read',{})]}},{msg:'Done groq.'});
 ev("S.keys.deepseek='';S.prov='groq';");
 els['#in'].value='fir se dekho';
 await handlers['#f:submit']({preventDefault(){}});
 ok(calls.length===2&&/groq/.test(calls[0].u),'groq used when DeepSeek has no key');
 ok(!calls[0].b.thinking&&calls[0].b.max_tokens===1024,'other providers: no thinking field, max_tokens unchanged');
 const am2=calls[1]&&calls[1].b.messages.find(m=>m.role==='assistant'&&m.tool_calls);
 ok(am2&&am2.reasoning_content===undefined,'reasoning_content is not sent to other providers');
 // 4. fallback: DeepSeek fails (HTTP 402) -> Groq answers
 calls.length=0;n=0;script.length=0;
 script.push({status:402},{msg:'Groq ne jawab diya.'});
 ev("S.keys.deepseek='"+DK+"';S.prov='auto';");
 els['#in'].value='teesri baar';
 await handlers['#f:submit']({preventDefault(){}});
 const l3=ev("H[H.length-1]");
 ok(l3&&l3.content==='Groq ne jawab diya.'&&/Groq/.test(l3.by||''),'DeepSeek fail -> Groq answers: '+(l3&&l3.by));
 ok(lines.map(l=>l.text||'').some(t=>/DeepSeek fail \(HTTP 402\), Groq try kar raha hu/.test(t)),'status shows the provider shift');
 // 5. key import knows DeepSeek keys
 const o1=ev("parseKeys('{\"deepseek\":\""+DK+"\"}')");
 ok(o1.keys.deepseek&&o1.keys.deepseek[0]===DK,'key import: labelled deepseek key');
 const o2=ev("parseKeys('"+DK+"')");
 ok(o2.keys.deepseek&&o2.keys.deepseek[0]===DK,'key import: bare sk- key goes to DeepSeek');
 const o3=ev("parseKeys('sk-or-v1-abcdefabcdefabcdefabcdefabcdef12')");
 ok(o3.keys.openrouter&&!o3.keys.deepseek,'key import: sk-or- stays OpenRouter');
 ok(ev("P.find(p=>p.id==='deepseek').ns")===1,'DeepSeek is kept out of scheduled AI notifications (ns flag)');
 console.log('\n'+pass+' passed, '+fail+' failed');process.exit(fail?1:0);
})();
