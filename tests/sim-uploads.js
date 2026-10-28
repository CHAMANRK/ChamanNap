// Step12b: attachments are copied to work/uploads (chunked base64), names do not clash, the AI is told the path, viewer saves to Download.
const vm=require('vm'),fs=require('fs');
const els={},handlers={};
const mk=sel=>{const o={value:'',style:{},dataset:{},options:[],classList:{add(){els[sel+'#open']=1},remove(){delete els[sel+'#open']},toggle(){}},addEventListener(t,f){const k=sel+':'+t,pv=handlers[k];handlers[k]=pv?async e=>{await pv(e);await f(e)}:f},insertAdjacentHTML(){},querySelector(){return mk('x')},closest(){return null},appendChild(){},remove(){},select(){},click(){},focus(){},set onclick(f){handlers[sel+':click']=f},set onchange(f){handlers[sel+':change']=f},scrollHeight:0,scrollTop:0,disabled:false,textContent:'',srcdoc:''};let h='';Object.defineProperty(o,'innerHTML',{get(){return h},set(v){h=v;if(sel==='#prov')o.options=v.split('<option').slice(1)}});return o};
const doc={querySelector:s=>els[s]||(els[s]=mk(s)),createElement:()=>mk('c'),body:mk('body'),documentElement:{dataset:{}},addEventListener(){}};
const store={};let n=0;const bodies=[];
const R='/sdcard/Chaman',UD=R+'/work/uploads/';
const DISK={};let access=true;const calls=[];
const rej=(code,message)=>Promise.reject(Object.assign(new Error(message),{code,message}));
const files=async(m,o)=>{
 calls.push(m+(o.append!=null?(o.append?'+':'0'):''));
 if(!access)return rej('NO_ACCESS','Chaman ko All files access nahi mili.');
 const p=o.path;
 if(m==='requestAccess')return{};
 if(m==='stat'){const t=DISK[p];return{path:p,exists:t!=null,dir:false,size:t==null?0:t.length}}
 if(m==='writeB64'){const d=Buffer.from(o.b64,'base64');if(!o.append){if(DISK[p]!=null)return rej('EXISTS','x');DISK[p]=d}else DISK[p]=Buffer.concat([DISK[p],d]);return{path:p,size:DISK[p].length}}
 if(m==='exportTo'){if(DISK[p]==null)return rej('NOT_FOUND','x');return{to:'/sdcard/Download/'+p.split('/').pop(),bytes:DISK[p].length}}
 if(m==='read'){const t=DISK[p];if(t==null)return rej('NOT_FOUND','x');const s=t.toString();return{path:p,text:s,lines:1,bytes:t.length,from:1,to:1,truncated:false}}
 return{};
};
const script=['Dekh liya.','Theek.','Ok.'];
const ctx={document:doc,btoa:s=>Buffer.from(s,'binary').toString('base64'),TextDecoder,localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=v}},matchMedia:()=>({matches:true,addEventListener(){}}),navigator:{},console,setTimeout:(f,ms)=>{const t=setTimeout(f,ms>10000?1e9:Math.min(ms,3));if(ms>10000)t.unref();return t},clearTimeout,URL,Image:function(){},
 fetch:async(u,o)=>{bodies.push(JSON.parse(o.body));const s=script[n++]||'ok';return{ok:true,status:200,json:async()=>({choices:[{message:{role:'assistant',content:s}}]}),text:async()=>''}}};
ctx.window=ctx;
ctx.Capacitor={nativePromise:async(pl,m,o)=>{if(pl==='Files')return files(m,o);if(pl==='Termux')return{stdout:'',exitCode:0};return{}}};
vm.createContext(ctx);
process.chdir(__dirname+'/../www');
for(const f of ['prompts','core','providers','chat','settings','attach','keys','helpers','phone','tools','termux','workspace','files','notes','slash','fast','rules','log','main'])vm.runInContext(fs.readFileSync('js/'+f+'.js','utf8'),ctx,{filename:f+'.js'});
const t=s=>vm.runInContext(s,ctx),getH=()=>t('H');
let fails=0;const ok=(c,l)=>{console.log((c?'PASS ':'FAIL ')+l);if(!c)fails++};
const mkFile=(name,buf,type)=>({name,size:buf.length,type:type||'',arrayBuffer:async()=>buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.length)});
const send=()=>handlers['#f:submit']({preventDefault(){}});
(async()=>{
 t("S.keys.groq='k';S.prov='groq';");
 const big=Buffer.alloc(900000);for(let i=0;i<big.length;i++)big[i]=(i*7+3)&255;
 const txt=Buffer.from('print("hi")\nprint("Hindi: नमस्ते")\n');
 // pick files through the real attach path
 await handlers['#fi:change']({target:{files:[mkFile('app.py',txt),mkFile('data.bin',big),mkFile('app.py',txt)],value:''}});
 ok(t('PEND.length')===3&&t('PEND[0].file')!==undefined,'attach keeps the File for saving');
 els['#in'].value='ye file badlo';await send();
 ok(DISK[UD+'app.py']&&DISK[UD+'app.py'].equals(txt),'text file saved byte-exact (utf-8 intact)');
 ok(DISK[UD+'data.bin']&&DISK[UD+'data.bin'].equals(big),'900 KB binary saved byte-exact in chunks (calls: '+calls.filter(c=>c==='writeB64+'||c==='writeB640').join(',')+')');
 const names=Object.keys(DISK).map(k=>k.replace(UD,''));
 ok(names.length===3&&names.filter(x=>/^app-\d{6}.*\.py$/.test(x)).length===1,'same name again gets a time suffix: '+names.join(', '));
 const um=getH().find(m=>m.role==='user');
 ok(um.files.every(f=>f.path&&f.path.indexOf(UD)===0),'message files carry their saved path');
 const sent=bodies[0].messages.filter(m=>m.role==='user').pop().content;
 ok(sent.includes('Saved copy: '+UD+'app.py')&&sent.includes('print("hi")'),'AI gets the text AND the saved path');
 ok(/data\.bin.*Saved copy/s.test(sent)&&/use the saved copy/.test(sent),'binary file: AI gets the path and a Termux hint');
 t('persist()');ok(JSON.parse(store['nap_h'])[0].files[0].path===um.files[0].path,'path survives persist');
 // after reload the body is gone, path remains
 const old=t("userText({role:'user',content:'x',files:[{name:'a.py',size:3,kind:'text',path:'/sdcard/Chaman/work/uploads/a.py'}]},false,false)");
 ok(old.includes('/work/uploads/a.py')&&!/Content available nahi/.test(old),'old attachment without body still points to the saved copy');
 // access denied: message still goes out, AI told
 access=false;await handlers['#fi:change']({target:{files:[mkFile('n.txt',Buffer.from('abc'))],value:''}});
 els['#in'].value='dekh';n=1;await send();
 const um2=getH().filter(m=>m.role==='user').pop();
 ok(um2.files[0].saveErr&&!um2.files[0].path,'no access: save error recorded, message still sent');
 const sent2=bodies[bodies.length-1].messages.filter(m=>m.role==='user').pop().content;
 ok(/could not be saved/.test(sent2)&&sent2.includes('abc'),'AI is told the copy failed (text still there)');
 ok(calls.includes('requestAccess'),'settings page opened for the permission');
 access=true;
 // too big
 const huge={name:'huge.zip',size:9*1024*1024,type:'',arrayBuffer:async()=>new ArrayBuffer(10)};
 const pl=[{name:'huge.zip',size:huge.size,file:huge}];await t('saveUploads')(pl);
 ok(/8MB/.test(pl[0].saveErr),'file over 8 MB is skipped with a reason');
 // viewer export button
 DISK[R+'/work/p/out.html']=Buffer.from('<p>x</p>');
 await vm.runInContext("openViewer({path:'/sdcard/Chaman/work/p/out.html',name:'out.html',title:'',kind:'html',size:8})",ctx);
 await new Promise(r=>setTimeout(r,20));
 await handlers['#vsave:click']();
 ok(els['#vtitle'].textContent==='Saved: Download/out.html','viewer save button -> Download ('+els['#vtitle'].textContent+')');
 ok(t("RULES.files").includes('work/uploads')&&t("RULES_VER")==='2026-10-28.5','rules mention uploads');
 console.log(fails?'\n'+fails+' FAILED':'\nALL PASS');process.exit(fails?1:0);
})().catch(e=>{console.error('ERR',e);process.exit(1)});
