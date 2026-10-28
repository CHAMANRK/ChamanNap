const vm=require('vm'),fs=require('fs');
const els={},handlers={};
const mk=sel=>{const o={value:'',style:{},dataset:{},options:[],classList:{add(){},remove(){},toggle(){}},addEventListener(t,f){handlers[sel+':'+t]=f},insertAdjacentHTML(){},querySelector(){return mk('x')},closest(){return null},appendChild(){},remove(){},select(){},click(){},set onclick(f){handlers[sel+':click']=f},set onchange(f){},scrollHeight:0,scrollTop:0,disabled:false,textContent:''};let h='';Object.defineProperty(o,'innerHTML',{get(){return h},set(v){h=v;if(sel==='#prov')o.options=v.split('<option').slice(1)}});return o};
const doc={querySelector:s=>els[s]||(els[s]=mk(s)),createElement:()=>mk('c'),body:mk('body'),documentElement:{dataset:{}}};
const store={};let n=0;const log=[];
const tc=(id,name,args)=>({id,type:'function',function:{name,arguments:JSON.stringify(args)}});
const script=[[tc('1','termux_run',{command:'ls ~ | head -3'})],[tc('2','termux_run',{command:'pkg upgrade -y'})],[tc('3','termux_write_file',{path:'~/notes.txt',content:'hello'})],[tc('4','termux_write_file',{path:'/sdcard/Download/a.txt',content:'x'})],[tc('5','termux_run',{command:'cat /sdcard/Download/a.txt'})],'Ho gaya.'];
const ctx={document:doc,localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=v}},matchMedia:()=>({matches:true,addEventListener(){}}),navigator:{},console,setTimeout:(f,ms)=>{const t=setTimeout(f,ms>10000?1e9:Math.min(ms,3));if(ms>10000)t.unref();return t},clearTimeout,URL,Image:function(){},
 fetch:async()=>{const s=script[n++];const msg=typeof s==='string'?{role:'assistant',content:s}:{role:'assistant',content:null,tool_calls:s};return{ok:true,status:200,json:async()=>({choices:[{message:msg}]}),text:async()=>''}}};
ctx.window=ctx;
ctx.Capacitor={nativePromise:async(pl,m,o)=>{
 if(pl==='Termux'){log.push('NT.'+m+' '+(o.command||o.path||'').slice(0,40));
   if(o.command&&o.command.includes('EXISTS'))return{stdout:'EXISTS\n',exitCode:0};
   if(o.command==='ls ~ | head -3')return{stdout:'a\nb\nc\n',stderr:'',exitCode:0};
   if(o.command==='pkg upgrade -y')return{stdout:'done',exitCode:0};
   if(m==='write')return{stdout:'OK '+o.path,exitCode:0};
   return{stdout:'x',exitCode:0}}
 return{}}};
vm.createContext(ctx);
for(const f of ['prompts','core','providers','chat','settings','attach','keys','helpers','phone','tools','termux','workspace','files','notes','slash','fast','rules','log','main'])vm.runInContext(fs.readFileSync('js/'+f+'.js','utf8'),ctx,{filename:f+'.js'});
const clickWhenPending=async(o)=>{for(let i=0;i<200;i++){await new Promise(r=>setTimeout(r,5));const H=vm.runInContext('H',ctx);const idx=H.findIndex(m=>m.confirm&&m.confirm.state==='pending');if(idx>=0){await handlers['#chat:click']({target:{closest:()=>({dataset:{m:String(idx),o}})}});return H[idx].content.split('\n')[0]}}return 'NO CARD'};
(async()=>{
 vm.runInContext("S.keys.groq='k';S.prov='groq';",ctx);
 els['#in'].value='termux me kuch files dekho aur upgrade karo';
 const done=handlers['#f:submit']({preventDefault(){}});
 console.log('card1:',await clickWhenPending('0'));      // pkg upgrade -> Allow
 console.log('card2:',await clickWhenPending('x'));      // overwrite ~/notes.txt -> Cancel
 console.log('card3:',await clickWhenPending('0'));      // write outside home -> Allow
 await done;
 console.log(log.join('\n'));
 const H=vm.runInContext('H',ctx);
 H.filter(m=>m.by==='Termux').forEach(m=>console.log('--chat['+(m.confirm?m.confirm.state:'out')+']:',m.content.replace(/\n/g,' | ').slice(0,150)));
 const l=H[H.length-1];console.log('STEPS:',l.steps.join(' / '));console.log('FINAL:',l.content);
})().catch(e=>{console.error('ERR',e);process.exit(1)});
