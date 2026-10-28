const vm=require('vm'),fs=require('fs');
const els={},handlers={};
const mk=sel=>{const o={value:'',style:{},dataset:{},options:[],classList:{add(){},remove(){},toggle(){}},addEventListener(t,f){handlers[sel+':'+t]=f},insertAdjacentHTML(){},querySelector(){return mk('x')},closest(){return null},appendChild(){},remove(){},select(){},click(){},set onclick(f){handlers[sel+':click']=f},set onchange(f){},scrollHeight:0,scrollTop:0,disabled:false,textContent:''};
 let h='';Object.defineProperty(o,'innerHTML',{get(){return h},set(v){h=v;if(sel==='#prov')o.options=v.split('<option').slice(1)}});return o};
const doc={querySelector:s=>els[s]||(els[s]=mk(s)),createElement:()=>mk('c'),body:mk('body'),documentElement:{dataset:{}}};
const store={};let n=0;const tcmds=[],reqs=[];
const tc=(id,name,args)=>({id,type:'function',function:{name,arguments:JSON.stringify(args)}});
const script=[
 'Aapke repo me ye hua:\n[Phone] $ git log --oneline (exit 0)\n4bd7b7f Implement Angular 17.3',            // 1 fake -> guard retry
 'Maine kuch chalaya nahi, git log dekhne ke liye bolo to chala dunga.',                                        // 2 honest after retry
 [tc('a','rules_read',{area:'termux'}),tc('b','rules_read',{area:'nope'})],                                    // 3 rules_read
 [tc('c','memory_save',{project:'jailer-2-info',note:'info saved here',desc:'Jailer 2'})],                    // 4 weak note
 [tc('d','memory_save',{project:'newproj',note:'index.html banayi, header fix baaki hai'})],                    // 5 no desc, new project
 [tc('e','memory_save',{project:'newproj',note:'index.html banayi, header fix baaki hai',desc:'Chhota test web app'})], // 6 ok
 'Ho gaya.',                                                                                                   // 7
 'Ek aur fake:\n$ ls\nfile.txt\n[exit 0]',                                                                      // 8 fake again (not "(exit" form)
];
const ctx={document:doc,localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=v}},matchMedia:()=>({matches:true,addEventListener(){}}),navigator:{},console,setTimeout:(f,ms)=>setTimeout(f,Math.min(ms,5)),clearTimeout,URL,Image:function(){},
 fetch:async(u,o)=>{reqs.push(JSON.parse(o.body));const s=script[n++];const msg=typeof s==='string'?{role:'assistant',content:s}:{role:'assistant',content:null,tool_calls:s};return{ok:true,status:200,json:async()=>({choices:[{message:msg}]}),text:async()=>''}}};
ctx.window=ctx;
ctx.Capacitor={nativePromise:async(pl,m,o)=>{
 if(pl==='Termux'&&m==='run'){tcmds.push(o.command);const c=o.command;
  if(c.includes('echo NEEDDESC'))return{stdout:'NEEDDESC',exitCode:0};
  if(c.includes('echo SAVED')||c.includes('SAVED $('))return{stdout:'SAVED 120',exitCode:0};
  if(c.includes('RW_OK'))return{stdout:'RW_OK',exitCode:0};
  if(c.includes('WS_OK'))return{stdout:'WS_OK\n# Memory index\n- x - y',exitCode:0};
  return{stdout:'',exitCode:0}}
 return{}}};
vm.createContext(ctx);
for(const f of ['prompts','core','providers','chat','settings','attach','keys','helpers','phone','tools','termux','workspace','files','notes','slash','fast','rules','log','main'])vm.runInContext(fs.readFileSync('js/'+f+'.js','utf8'),ctx,{filename:f+'.js'});
const ev=s=>vm.runInContext(s,ctx);
const send=async t=>{els['#in'].value=t;await handlers['#f:submit']({preventDefault(){}})};
(async()=>{
 ev("S.keys.groq='gsk_t';S.prov='groq';");
 // 1) area detection
 const ar=t=>JSON.stringify(ev('ruleAreas('+JSON.stringify(t)+')'));
 console.log('areas whatsapp msg:',ar('rahul ko whatsapp pe hii bhejo'));
 console.log('areas memory q:',ar('memory me kya kya save he'));
 console.log('areas chit-chat:',ar('aaj mausam kaisa lagta he, kuch mazedaar bata'));
 console.log('areas skill:',ar('tu kya kya kar sakta he'));
 // 2) risk fix
 console.log('risk find 2>/dev/null:',JSON.stringify(ev("riskOf(\"find /sdcard/Chaman -type d -name 'x' 2>/dev/null\",10)")));
 console.log('risk echo > /sdcard/x:',JSON.stringify(ev("riskOf('echo a > /sdcard/Download/x',10)")));
 // 3) guard + rules injection + tools
 await send('git log chalao');
 let H=ev('H'),last=H[H.length-1];
 console.log('guard retry calls so far:',n,'| final:',last.content.slice(0,70));
 console.log('fake text reached user:',/4bd7b7f/.test(last.content));
 const sys0=reqs[0].messages[0].content;
 console.log('system has WORKFLOW:',sys0.includes('WORKFLOW'),'| has RULES block (termux):',sys0.includes('RULES FOR THIS TASK')&&sys0.includes('TERMUX (shell'),'| sys chars:',sys0.length);
 console.log('retry msg sent:',reqs[1].messages.some(m=>String(m.content).includes('[AUTO from app] Tumhare jawab')));
 await send('memory me jailer-2-info save karo, newproj bhi');
 H=ev('H');last=H[H.length-1];
 console.log('STEPS:\n'+last.steps.join('\n'));
 console.log('rules_read result in AI context:',reqs[2].messages.some(m=>m.role==='tool'&&String(m.content).startsWith('RULES (termux)'))||reqs[3].messages.some(m=>m.role==='tool'&&String(m.content).startsWith('RULES (termux)')));
 // 4) fake without "(exit" form must NOT trigger, 'exit' with form triggers
 console.log('fakeOut plain code:',ev("fakeOut('Ye command chalao:\\n```bash\\nls\\n```')"),'| fakeOut [app log]:',ev("fakeOut('x\\n[app log] hi')"),'| fakeOut $ + (exit 0):',ev("fakeOut('$ ls\\nfoo\\n(exit 0)')"));
 // 5) skill + folder sync
 const sk=ev('skillText()');
 console.log('skill lists all tools:',ev("TOOLS.every(t=>skillText().includes('- '+t.function.name+'('))"),'| skill chars:',sk.length);
 await new Promise(r=>setTimeout(r,200));
 console.log('rules folder sync wrote files:',tcmds.filter(c=>c.includes('RW_OK')).length,'| S.rv set:',ev('S.rv===RULES_VER'),'| index line added:',tcmds.some(c=>c.includes('- rules/ -')));
 console.log('rules copy has header:',tcmds.some(c=>c.includes('AI app wali padhta hai')));
})().catch(e=>{console.error('ERR',e);process.exit(1)});
