const vm=require('vm'),fs=require('fs');
const els={},handlers={};
const mk=sel=>{const o={value:'',style:{},dataset:{},options:[],classList:{add(){},remove(){},toggle(){}},addEventListener(t,f){handlers[sel+':'+t]=f},insertAdjacentHTML(){},querySelector(){return mk('x')},closest(){return null},appendChild(){},remove(){},select(){},click(){},set onclick(f){handlers[sel+':click']=f},set onchange(f){},scrollHeight:0,scrollTop:0,disabled:false,textContent:''};let h='';Object.defineProperty(o,'innerHTML',{get(){return h},set(v){h=v;if(sel==='#prov')o.options=v.split('<option').slice(1)}});return o};
const doc={querySelector:s=>els[s]||(els[s]=mk(s)),createElement:()=>mk('c'),body:mk('body'),documentElement:{dataset:{}}};
const store={};let n=0;const log=[];
const tc=(id,name,args)=>({id,type:'function',function:{name,arguments:JSON.stringify(args)}});
const script=[[tc('1','open_app',{name:'PhonePe'})],[tc('2','screen_read',{})],[tc('3','screen_read',{})],'Balance dekh liya.'];
const lock={pkg:'com.android.systemui',items:[{i:0,k:'TextView',t:'Enter password'},...[1,2,3,4,5,6,7,8,9,0].map((d,i)=>({i:i+1,k:'Button',f:'c',t:String(d)}))]};
const home={pkg:'com.phonepe.app',items:[{i:0,k:'TextView',t:'Check balance'},{i:1,k:'TextView',t:'Balance Rs 1200'},{i:2,k:'TextView',t:'Send money'}]};
let reads=0;
const ctx={document:doc,localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=v}},matchMedia:()=>({matches:true,addEventListener(){}}),navigator:{},console,setTimeout:(f,ms)=>setTimeout(f,Math.min(ms,3)),clearTimeout,URL,Image:function(){},
 fetch:async()=>{const s=script[n++];const msg=typeof s==='string'?{role:'assistant',content:s}:{role:'assistant',content:null,tool_calls:s};return{ok:true,status:200,json:async()=>({choices:[{message:msg}]}),text:async()=>''}}};
ctx.window=ctx;
ctx.Capacitor={nativePromise:async(pl,m,o)=>{log.push(m+(m==='pill'?':'+o.text:''));
 if(m==='openApp')return{label:'PhonePe'};
 if(m==='read'){reads++;return reads<=4?lock:home}   // user "types PIN" for first polls, then screen changes
 if(m==='pill')return{ok:false,err:'app overlay: SecurityException'};
 return{}}};
vm.createContext(ctx);
for(const f of ['prompts','core','providers','chat','settings','attach','keys','helpers','phone','tools','termux','workspace','fast','log','main'])vm.runInContext(fs.readFileSync('js/'+f+'.js','utf8'),ctx,{filename:f+'.js'});
(async()=>{
 vm.runInContext("S.keys.groq='k';S.prov='groq';",ctx);
 els['#in'].value='phonepe se balance dekho';
 await handlers['#f:submit']({preventDefault(){}});
 console.log(log.join(' > '));
 const H=vm.runInContext('H',ctx),l=H[H.length-1];
 console.log('STEPS:',l.steps.join(' / '));console.log('FINAL:',l.content);
})().catch(e=>{console.error('ERR',e);process.exit(1)});
