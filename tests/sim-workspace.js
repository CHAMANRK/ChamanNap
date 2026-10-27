// Workspace + memory wiring: workspace write (backup, no confirm), shrink guard, risk exemption, memory auto-load, memory_read/save, auto memory pass.
const vm=require('vm'),fs=require('fs');
const els={},handlers={};
const mk=sel=>{const o={value:'',style:{},dataset:{},options:[],classList:{add(){},remove(){},toggle(){}},addEventListener(t,f){handlers[sel+':'+t]=f},insertAdjacentHTML(){},querySelector(){return mk('x')},closest(){return null},appendChild(){},remove(){},select(){},click(){},set onclick(f){handlers[sel+':click']=f},set onchange(f){},scrollHeight:0,scrollTop:0,disabled:false,textContent:''};let h='';Object.defineProperty(o,'innerHTML',{get(){return h},set(v){h=v;if(sel==='#prov')o.options=v.split('<option').slice(1)}});return o};
const doc={querySelector:s=>els[s]||(els[s]=mk(s)),createElement:()=>mk('c'),body:mk('body'),documentElement:{dataset:{}}};
const store={};let n=0;const log=[],bodies=[];
const tc=(id,name,args)=>({id,type:'function',function:{name,arguments:JSON.stringify(args)}});
const BIG='x'.repeat(1000);
const script=[
 [tc('1','termux_read_file',{path:'/sdcard/Chaman/work/app/index.html',max_lines:50})],
 [tc('2','termux_write_file',{path:'/sdcard/Chaman/work/app/index.html',content:'<h1>small</h1>'})],   // shrinks 1000 -> 14: card
 [tc('3','termux_write_file',{path:'/sdcard/Chaman/work/app/new.txt',content:'hello'})],              // NEW: no card
 [tc('4','termux_run',{command:'cp ~/a.txt /sdcard/Chaman/work/app/ && ls /sdcard/Chaman/work/app'})],  // no card
 [tc('5','termux_run',{command:'cp ~/a.txt /sdcard/Download/'})],                                       // card (outside workspace)
 [tc('6','termux_run',{command:'cat /sdcard/Chaman/../Download/x.txt > /sdcard/Download/y'})],           // traversal -> card
 [tc('7','termux_write_file',{path:'/sdcard/Chaman/../x.txt',content:'z'})],                              // traversal -> normal rules (outside home card)
 'Ho gaya.',
 [tc('8','memory_save',{project:'App Test!',note:'index.html chhota kiya\nnew.txt banayi',desc:'test app'})] // hidden auto-memory pass
];
const ctx={document:doc,localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=v}},matchMedia:()=>({matches:true,addEventListener(){}}),navigator:{},console,setTimeout:(f,ms)=>{const t=setTimeout(f,ms>10000?1e9:Math.min(ms,3));if(ms>10000)t.unref();return t},clearTimeout,URL,Image:function(){},
 fetch:async(u,o)=>{bodies.push(JSON.parse(o.body));const s=script[n++];const msg=typeof s==='string'?{role:'assistant',content:s}:{role:'assistant',content:null,tool_calls:s};return{ok:true,status:200,json:async()=>({choices:[{message:msg}]}),text:async()=>''}}};
ctx.window=ctx;
ctx.Capacitor={nativePromise:async(pl,m,o)=>{
 if(pl==='Termux'){const c=o.command||o.path||'';log.push('NT.'+m+' '+c.slice(0,70).replace(/\n/g,' '));
   if(c.includes('WS_OK')&&c.includes('head -c 1200'))return{stdout:'WS_OK\n# Memory index\n- carrom - carrom game MEMMARK\n',exitCode:0};
   if(c.includes('BACKED')&&c.includes('index.html'))return{stdout:'BACKED 1000\n',exitCode:0};
   if(c.includes('BACKED'))return{stdout:'NEW\n',exitCode:0};
   if(c.includes('SAVED'))return{stdout:'SAVED 120\n',exitCode:0};
   if(m==='write')return{stdout:'OK '+o.path,exitCode:0};
   return{stdout:'x',stderr:'',exitCode:0}}
 return{}}};
vm.createContext(ctx);
process.chdir(__dirname+'/../www');
for(const f of ['prompts','core','providers','chat','settings','attach','keys','helpers','phone','tools','termux','workspace','log','main'])vm.runInContext(fs.readFileSync('js/'+f+'.js','utf8'),ctx,{filename:f+'.js'});
const cards=[];
const clickWhenPending=async(o)=>{for(let i=0;i<300;i++){await new Promise(r=>setTimeout(r,5));const H=vm.runInContext('H',ctx);const idx=H.findIndex(m=>m.confirm&&m.confirm.state==='pending');if(idx>=0){const head=H[idx].content.split('\n')[0],why=H[idx].content.split('Wajah: ')[1];await handlers['#chat:click']({target:{closest:()=>({dataset:{m:String(idx),o}})}});return head+' | wajah: '+why}}return 'NO CARD'};
(async()=>{
 vm.runInContext("S.keys.groq='k';S.prov='groq';",ctx);
 console.log('risk ws cp   :',JSON.stringify(vm.runInContext("riskOf('cp ~/a /sdcard/Chaman/work/x/',60)",ctx)));
 console.log('risk ws cat> :',JSON.stringify(vm.runInContext("riskOf('echo hi >> /sdcard/Chaman/memory/general.md',60)",ctx)));
 console.log('risk dl cp   :',JSON.stringify(vm.runInContext("riskOf('cp ~/a /sdcard/Download/',60)",ctx)));
 console.log('risk ..      :',JSON.stringify(vm.runInContext("riskOf('cp ~/a /sdcard/Chaman/../Download/',60)",ctx)));
 console.log('risk rm ws   :',JSON.stringify(vm.runInContext("riskOf('rm /sdcard/Chaman/work/x',60)",ctx)));
 console.log('wsPath ok    :',vm.runInContext("wsPath('/storage/emulated/0/Chaman/work/a.txt')",ctx));
 console.log('wsPath ..    :',JSON.stringify(vm.runInContext("wsPath('/sdcard/Chaman/../x')",ctx)));
 console.log('wsPath other :',JSON.stringify(vm.runInContext("wsPath('/sdcard/Chamanx/a')",ctx)));
 els['#in'].value='app ki index.html chhoti karo aur memory update karo';
 const done=handlers['#f:submit']({preventDefault(){}});
 console.log('card A:',await clickWhenPending('0'));  // shrink guard -> Allow
 console.log('card B:',await clickWhenPending('x'));  // cp to Download -> Cancel
 console.log('card C:',await clickWhenPending('x'));  // traversal cat -> Cancel
 console.log('card D:',await clickWhenPending('x'));  // traversal write -> Cancel
 await done;
 console.log(log.join('\n'));
 const H=vm.runInContext('H',ctx),l=H[H.length-1];
 console.log('STEPS:',l.steps.join(' / '));console.log('FINAL:',l.content);
 console.log('system has memory block:',bodies[0].messages[0].content.includes('MEMMARK'));
 console.log('fetch calls:',bodies.length,'| last call tools:',(bodies[bodies.length-1].tools||[]).map(t=>t.function.name).join(','));
 console.log('memory cmd slug ok:',log.some(x=>x.includes('app-test')||x.includes('SAVED'))); 
})().catch(e=>{console.error('ERR',e);process.exit(1)});
