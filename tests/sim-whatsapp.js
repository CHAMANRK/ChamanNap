const vm=require('vm'),fs=require('fs');
const els={},handlers={};
const mk=sel=>{const o={value:'',style:{},dataset:{},options:[],classList:{add(){},remove(){},toggle(){}},addEventListener(t,f){handlers[sel+':'+t]=f},insertAdjacentHTML(){},querySelector(){return mk('x')},closest(){return null},appendChild(){},remove(){},select(){},click(){},set onclick(f){handlers[sel+':click']=f},set onchange(f){},scrollHeight:0,scrollTop:0,disabled:false,textContent:''};
 let h='';Object.defineProperty(o,'innerHTML',{get(){return h},set(v){h=v;if(sel==='#prov')o.options=v.split('<option').slice(1)}});return o};
const doc={querySelector:s=>els[s]||(els[s]=mk(s)),createElement:()=>mk('c'),body:mk('body'),documentElement:{dataset:{}}};
const store={};let n=0;const log=[];
const tc=(id,name,args)=>({id,type:'function',function:{name,arguments:JSON.stringify(args)}});
const script=[
 [tc('1','open_app',{name:'WhatsApp',status:'Opening WhatsApp'})],
 [tc('2','screen_read',{status:'Reading chats'})],
 [tc('3','screen_click',{id:4,status:'Finding Rahul'})],
 [tc('4','screen_type',{text:'Hii',status:'Typing message'})],
 [tc('5','screen_click',{text:'Send',status:'Pressing Send'})],
 [tc('6','screen_click',{text:'Pay now'})],
 'Rahul ko Hii bhej diya.'];
const ctx={document:doc,localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=v}},matchMedia:()=>({matches:true,addEventListener(){}}),navigator:{},console,setTimeout:(f,ms)=>setTimeout(f,Math.min(ms,5)),clearTimeout,URL,Image:function(){},
 fetch:async(u,o)=>{const s=script[n++];const msg=typeof s==='string'?{role:'assistant',content:s}:{role:'assistant',content:null,tool_calls:s};return{ok:true,status:200,json:async()=>({choices:[{message:msg}]}),text:async()=>''}}};
ctx.window=ctx;
ctx.Capacitor={nativePromise:async(pl,m,o)=>{log.push(pl+'.'+m+(o&&Object.keys(o).length?JSON.stringify(o):''));
 if(pl==='PhoneControl'&&m==='openApp')return{label:'WhatsApp'};
 if(m==='read')return{pkg:'com.whatsapp',items:[{i:0,k:'TextView',t:'WhatsApp'},{i:4,k:'TextView',f:'c',t:'Rahul'}]};
 if(m==='click'&&o.text==='Pay now'){const e=new Error('"Pay now" paisa button hai');e.code='BLOCKED';throw e}
 if(m==='click')return{label:o.text||'Rahul'};
 return{}}};
ctx.window=ctx;vm.createContext(ctx);
for(const f of ['prompts','core','providers','chat','settings','attach','keys','helpers','phone','tools','termux','workspace','fast','log','main'])vm.runInContext(fs.readFileSync('js/'+f+'.js','utf8'),ctx,{filename:f+'.js'});
(async()=>{
 vm.runInContext("S.keys.groq='gsk_t';S.prov='groq';",ctx);
 els['#in'].value='whatsapp pe rahul ko Hii bhejo';
 await handlers['#f:submit']({preventDefault(){}});
 console.log(log.join('\n'));
 const H=vm.runInContext('H',ctx);const last=H[H.length-1];
 console.log('FINAL:',last.content,'| by',last.by);console.log('STEPS:',last.steps.join(' / '));
 console.log('DEF_SYS has screen:',vm.runInContext("DEF_SYS.includes('SCREEN CONTROL')&&!DEF_SYS.includes('Other phone control: wifi')",ctx));
})().catch(e=>{console.error('ERR',e);process.exit(1)});
