const vm=require('vm'),fs=require('fs');
const els={},handlers={};
const mk=sel=>{const o={value:'',style:{},dataset:{},options:[],classList:{add(){},remove(){},toggle(){}},addEventListener(t,f){handlers[sel+':'+t]=f},insertAdjacentHTML(){},querySelector(){return mk('x')},closest(){return null},appendChild(){},remove(){},select(){},click(){},set onclick(f){handlers[sel+':click']=f},set onchange(f){},scrollHeight:0,scrollTop:0,disabled:false,textContent:''};
 let h='';Object.defineProperty(o,'innerHTML',{get(){return h},set(v){h=v;if(sel==='#prov')o.options=v.split('<option').slice(1)}});return o};
const doc={querySelector:s=>els[s]||(els[s]=mk(s)),createElement:()=>mk('c'),body:mk('body'),documentElement:{dataset:{}}};
const store={};let n=0;const log=[],bodies=[];let reads=0;
const tc=(id,name,args)=>({id,type:'function',function:{name,arguments:JSON.stringify(args)}});
const script=[
 [tc('1','open_url',{uri:'https://wa.me/{number}?text={text}',contact:'Rahul',text:'Hii bhai, kaise ho?',app:'com.whatsapp'})],
 [tc('2','tap_when_visible',{text:'Send|भेजें',app:'com.whatsapp',timeout_s:10})],
 [tc('3','run_flow',{steps:[{do:'type',text:'secret-msg-123'},{do:'click',text:'Nahi hai',timeout_s:2,app:'com.whatsapp'},{do:'key',key:'back'}]})],
 [tc('4','open_url',{uri:'file:///sdcard/x.txt'})],
 [tc('5','open_url',{uri:'https://wa.me/{number}?text={text}',contact:'Amit',text:'hi'})],
 [tc('6','run_flow',{steps:[{do:'open_app',name:'WhatsApp'},{do:'wait_for',text:'Chats',app:'com.whatsapp'},{do:'click',text:'Send',app:'com.whatsapp'}]})],
 [tc('7','tap_when_visible',{text:'Send',app:'com.other.app',timeout_s:2})],
 'Ho gaya.'];
const ctx={document:doc,localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=v}},matchMedia:()=>({matches:true,addEventListener(){}}),navigator:{},console,setTimeout:(f,ms)=>setTimeout(f,Math.min(ms,5)),clearTimeout,URL,Image:function(){},
 fetch:async(u,o)=>{bodies.push(o&&o.body||'');const s=script[n++];const msg=typeof s==='string'?{role:'assistant',content:s}:{role:'assistant',content:null,tool_calls:s};return{ok:true,status:200,json:async()=>({choices:[{message:msg}]}),text:async()=>''}}};
ctx.window=ctx;
ctx.Capacitor={nativePromise:async(pl,m,o)=>{log.push(pl+'.'+m+(o&&Object.keys(o).length&&m!=='pill'?JSON.stringify(o):''));
 if(pl==='PhoneControl'&&m==='findContact'){
  if(o.name==='Rahul')return{matches:[{name:'Rahul',number:'98765 43210'},{name:'Rahul Sharma',number:'+91 91111 22222'}]};
  if(o.name==='Amit')return{matches:[{name:'Amit K',number:'9000000001'},{name:'Amit Verma',number:'9000000002'}]};
  return{matches:[]}}
 if(pl==='PhoneControl'&&m==='openUrl'){if(o.app==='com.nope'){const e=new Error('x');e.code='NOT_FOUND';throw e}return{}}
 if(pl==='PhoneControl'&&m==='openApp')return{label:'WhatsApp'};
 if(m==='activity')return{count:0,kbd:false};
 if(m==='read'){reads++;
  if(reads===1)return{pkg:'com.whatsapp',items:[{i:1,k:'TextView',t:'Loading'}]};
  return{pkg:'com.whatsapp',items:[{i:3,k:'TextView',t:'Send a message to everyone in the long group name'},{i:7,k:'ImageButton',f:'c',t:'Send'},{i:8,k:'TextView',t:'Chats'}]}}
 if(m==='key')return{ok:true};
 if(m==='click')return{label:'Send'};
 return{}}};
vm.createContext(ctx);
for(const f of ['prompts','core','providers','chat','settings','attach','keys','helpers','phone','tools','termux','workspace','fast','rules','log','main'])vm.runInContext(fs.readFileSync('js/'+f+'.js','utf8'),ctx,{filename:f+'.js'});
(async()=>{
 vm.runInContext("S.keys.groq='gsk_t';S.prov='groq';",ctx);
 els['#in'].value='whatsapp pe rahul ko hii bhejo';
 await handlers['#f:submit']({preventDefault(){}});
 console.log(log.filter(x=>!/pill|activity|reset|finish|Termux.run|ScreenControl.read/.test(x)).join('\n'));console.log('reads total:',reads);
 const H=vm.runInContext('H',ctx),last=H[H.length-1];
 console.log('FINAL:',last.content);console.log('STEPS:\n'+last.steps.join('\n'));
 const all=bodies.join(' ');
 console.log('number leaked to AI:',/9876543210|919876543210|9111122222/.test(all));
 console.log('typed text leaked to AI:',/secret-msg-123/.test(all));
 console.log('tools registered:',vm.runInContext("TOOLS.filter(t=>/open_url|tap_when_visible|run_flow/.test(t.function.name)).length",ctx));
 console.log('DEF_SYS has FAST PATH:',vm.runInContext("RULES.links.includes('FAST PATH')&&PREV13_SYS.includes('FAST PATH')",ctx));
 const lg=vm.runInContext("LOGQ.map(x=>x.text).join('\\n')",ctx);console.log('log leaks text:',/Hii bhai|secret-msg/.test(lg));
})().catch(e=>{console.error('ERR',e);process.exit(1)});
