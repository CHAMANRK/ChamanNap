const vm=require('vm'),fs=require('fs');
const els={},handlers={};
const mk=sel=>{const o={value:'',style:{},dataset:{},options:[],classList:{add(){},remove(){},toggle(){}},addEventListener(t,f){handlers[sel+':'+t]=f},insertAdjacentHTML(){},querySelector(){return mk('x')},closest(){return null},appendChild(){},remove(){},select(){},click(){},set onclick(f){handlers[sel+':click']=f},set onchange(f){},scrollHeight:0,scrollTop:0,disabled:false,textContent:''};let h='';Object.defineProperty(o,'innerHTML',{get(){return h},set(v){h=v;if(sel==='#prov')o.options=v.split('<option').slice(1)}});return o};
const doc={querySelector:s=>els[s]||(els[s]=mk(s)),createElement:()=>mk('c'),body:mk('body'),documentElement:{dataset:{}}};
const store={};let n=0;const log=[];
const tc=(id,name,args)=>({id,type:'function',function:{name,arguments:JSON.stringify(args)}});
const script=[[tc('1','open_app',{name:'Termux'})],[tc('2','screen_type',{text:'apt update'})],[tc('3','ask_user',{message:'Terminal pe kahin bhi tap karo',after:'Aapne kar diya, ab command likhta hoon'})],[tc('4','screen_type',{text:'apt update',submit:true})],'Command chala diya.'];
let acts=0,typed=0;
const ctx={document:doc,localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=v}},matchMedia:()=>({matches:true,addEventListener(){}}),navigator:{},console,setTimeout:(f,ms)=>setTimeout(f,Math.min(ms,3)),clearTimeout,URL,Image:function(){},
 fetch:async()=>{const s=script[n++];const msg=typeof s==='string'?{role:'assistant',content:s}:{role:'assistant',content:null,tool_calls:s};return{ok:true,status:200,json:async()=>({choices:[{message:msg}]}),text:async()=>''}}};
ctx.window=ctx;
let polls=0;
ctx.Capacitor={nativePromise:async(pl,m,o)=>{
 if(m==='pill')log.push('pill['+o.mode+','+o.state+'] '+o.text);else if(m!=='activity'&&m!=='read'&&m!=='reset')log.push(m);
 if(m==='openApp')return{label:'Termux'};
 if(m==='read')return{pkg:'com.termux',items:[{i:0,k:'TerminalView',t:'$ '}]};
 if(m==='type'){typed++;if(typed===1){const e=new Error('Text set nahi hua');e.code='TYPE_FAILED';throw e}return{}}
 if(m==='activity'){polls++;if(polls>4)acts=1;return{count:acts,kbd:false,done:false,stop:false}}
 return{}}};
vm.createContext(ctx);
for(const f of ['prompts','core','providers','chat','settings','attach','keys','helpers','phone','tools','termux','workspace','log','main'])vm.runInContext(fs.readFileSync('js/'+f+'.js','utf8'),ctx,{filename:f+'.js'});
(async()=>{
 vm.runInContext("S.keys.groq='k';S.prov='groq';",ctx);
 els['#in'].value='termux kholo aur apt update chalao';
 await handlers['#f:submit']({preventDefault(){}});
 console.log(log.join('\n'));
 const H=vm.runInContext('H',ctx),l=H[H.length-1];
 console.log('STEPS:',l.steps.join(' / '));console.log('FINAL:',l.content);
})().catch(e=>{console.error('ERR',e);process.exit(1)});
