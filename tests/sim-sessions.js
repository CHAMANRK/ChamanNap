// Step25: sessions. Each chat is a folder sessions/<id>/ (chat.json, chat.md, session.md, uploads, logs, modify); New chat / app kill end it; Sessions list continues one.
// Run: cd www && node ../tests/sim-sessions.js
const vm=require('vm'),fs=require('fs');
const els={},handlers={};
const mk=sel=>{const o={value:'',style:{},dataset:{},options:[],classList:{add(){els[sel+'#open']=1},remove(){delete els[sel+'#open']},toggle(){}},addEventListener(t,f){const k=sel+':'+t,pv=handlers[k];handlers[k]=pv?async e=>{await pv(e);await f(e)}:f},insertAdjacentHTML(){},querySelector(){return mk('x')},closest(){return null},appendChild(){},remove(){},select(){},click(){},focus(){},set onclick(f){handlers[sel+':click']=f},set onchange(f){handlers[sel+':change']=f},scrollHeight:0,scrollTop:0,disabled:false,textContent:'',srcdoc:''};let h='';Object.defineProperty(o,'innerHTML',{get(){return h},set(v){h=v;if(sel==='#prov')o.options=v.split('<option').slice(1)}});return o};
const doc={querySelector:s=>els[s]||(els[s]=mk(s)),createElement:()=>mk('c'),body:mk('body'),documentElement:{dataset:{}},addEventListener(){}};
const R='/sdcard/Chaman',DISK={},cmds=[];
const store={},sstore={};let n=0;
const rej=(code,message)=>Promise.reject(Object.assign(new Error(message),{code,message}));
const files=async(m,o)=>{
 const p=o.path;
 if(m==='stat'){const t=DISK[p];return{path:p,exists:t!=null,dir:false,size:t==null?0:t.length}}
 if(m==='write'){DISK[p]=Buffer.from(o.content);return{path:p,backed:false}}
 if(m==='append'){DISK[p]=Buffer.concat([DISK[p]||Buffer.alloc(0),Buffer.from(o.content)]);return{path:p,size:DISK[p].length}}
 if(m==='writeB64'){const d=Buffer.from(o.b64,'base64');DISK[p]=o.append?Buffer.concat([DISK[p],d]):d;return{path:p,size:DISK[p].length}}
 if(m==='read'){const t=DISK[p];if(t==null)return rej('NOT_FOUND','x');return{path:p,text:t.toString(),lines:1,bytes:t.length}}
 return{};
};
const writes=[];const origFiles=files;
const script=['Dekh liya.','Theek.','Ok.','Done.'];
const mkCtx=()=>{
 const c={document:doc,btoa:s=>Buffer.from(s,'binary').toString('base64'),TextDecoder,localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=v}},sessionStorage:{getItem:k=>sstore[k]||null,setItem:(k,v)=>{sstore[k]=v},removeItem:k=>{delete sstore[k]}},matchMedia:()=>({matches:true,addEventListener(){}}),navigator:{},console,setTimeout:(f,ms)=>{const t=setTimeout(f,ms>10000?1e9:Math.min(ms,3));if(ms>10000)t.unref();return t},clearTimeout,URL,Image:function(){},
 fetch:async(u,o)=>{const s=script[n++]||'ok';return{ok:true,status:200,json:async()=>({choices:[{message:{role:'assistant',content:s}}]}),text:async()=>''}}};
 c.window=c;
 c.Capacitor={nativePromise:async(pl,m,o)=>{if(pl==='Files'){if(m==='write')writes.push(o);return files(m,o)}if(pl==='Termux'){cmds.push(o.command||'');return{stdout:'LOGGED',exitCode:0}}return{}}};
 vm.createContext(c);return c;
};
process.chdir(__dirname+'/../www');
let ctx;
const boot=()=>{
 for(const k in els)delete els[k];for(const k in handlers)delete handlers[k];
 ctx=mkCtx();
 for(const f of ['prompts','core','status','providers','chat','settings','attach','keys','helpers','phone','tools','termux','workspace','files','notes','slash','fast','intents','termuxapi','runner','rules','log','sessions','main'])vm.runInContext(fs.readFileSync('js/'+f+'.js','utf8'),ctx,{filename:f+'.js'});
 vm.runInContext("S.keys.groq='k';S.prov='groq';",ctx);
};
const t=s=>vm.runInContext(s,ctx),wait=ms=>new Promise(r=>setTimeout(r,ms));
const send=async txt=>{els['#in'].value=txt;await handlers['#f:submit']({preventDefault(){}});await wait(30)};
const mkFile=(name,buf)=>({name,size:buf.length,type:'',arrayBuffer:async()=>buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.length)});
let fails=0;const ok=(c,l)=>{console.log((c?'PASS ':'FAIL ')+l);if(!c)fails++};
const J=p=>JSON.parse(DISK[p].toString());
(async()=>{
 // 1. first run of this version: an old chat in localStorage becomes its own (ended) session, the new chat is empty
 store.nap_h=JSON.stringify([{role:'user',content:'purani baat'},{role:'assistant',content:'purana jawab',by:'Groq'}]);
 boot();await wait(30);
 ok(t('H.length')===0&&t('SES')===null,'cold start: fresh empty chat, no session folder yet');
 let ix=J(R+'/sessions/_index.json');
 ok(ix.length===1&&ix[0].title==='purani baat'&&ix[0].end===true,'old chat archived as an ended session ('+ix[0].title+')');
 const old=ix[0].id;
 ok(J(R+'/sessions/'+old+'/chats/chat.json').length===2&&/status: ended/.test(DISK[R+'/sessions/'+old+'/session.md'].toString())&&/purani baat/.test(DISK[R+'/sessions/'+old+'/chats/chat.md'].toString()),'archive has chat.json, chat.md, session.md');
 // 2. first message creates the session, upload and log go inside it
 const up=Buffer.from('print(1)\n');
 await handlers['#fi:change']({target:{files:[mkFile('a.py',up)],value:''}});
 await send('naya kaam');
 const id=t('SES.id');
 ok(/^\d{4}-\d\d-\d\d_\d{4}_[a-z0-9]{4}$/.test(id),'first message makes a session id ('+id+')');
 ok(DISK[R+'/sessions/'+id+'/uploads/a.py']!=null&&t('H[0].files[0].path')===R+'/sessions/'+id+'/uploads/a.py','upload saved in the session uploads folder');
 await t('logFlush(true)');
 ok(cmds.some(c=>c.includes('/sessions/'+id+'/logs/log.md')),'log goes to the session logs folder');
 const ch=J(R+'/sessions/'+id+'/chats/chat.json');
 ok(ch.length===2&&ch[0].content==='naya kaam'&&ch[0].imgs===undefined&&ch[1].content==='Dekh liya.','chat.json saved after the turn');
 ix=J(R+'/sessions/_index.json');ok(ix.length===2&&ix[0].id===id&&ix[0].end===false,'index lists both, running one first');
 // 3. page reload in the same app run keeps the session
 boot();await wait(30);
 ok(t('SES.id')===id&&t('H.length')===2,'reload in same run: same session and chat');
 // 4. modify list
 t("sesChange('file_write',{path:'/sdcard/Chaman/work/x.txt'});sesChange('file_read',{path:'/sdcard/Chaman/work/y.txt'})");await wait(10);
 const mc=DISK[R+'/sessions/'+id+'/modify/changes.md'].toString();
 ok(/file_write \/sdcard\/Chaman\/work\/x\.txt/.test(mc)&&!/file_read/.test(mc),'modify/changes.md lists writes only');
 // 5. New chat ends the session
 await handlers['#newb:click']();
 ok(t('H.length')===0&&t('SES')===null&&/status: ended/.test(DISK[R+'/sessions/'+id+'/session.md'].toString()),'New chat: session ended, chat empty');
 await send('doosra kaam');
 const id2=t('SES.id');ok(id2&&id2!==id,'next message = new session ('+id2+')');
 // 6. sessions list + continue
 await handlers['#sesb:click']();
 ok(els['#sesw#open']&&/naya kaam/.test(els['#sesl'].innerHTML)&&/doosra kaam/.test(els['#sesl'].innerHTML),'list shows saved sessions');
 await handlers['#sesl:click']({target:{closest:()=>({dataset:{id}})}});
 ok(t('SES.id')===id&&t('H.length')===2&&t('H[0].content')==='naya kaam','continue: old chat back, same session folder');
 ok(!els['#sesw#open'],'list closes after continue');
 ok(/status: ended/.test(DISK[R+'/sessions/'+id2+'/session.md'].toString()),'the session that was running got saved as ended');
 await send('aage ka sawal');await wait(30);
 ok(J(R+'/sessions/'+id+'/chats/chat.json').length===4,'new messages go into the continued session folder');
 // 7. app kill (new sessionStorage) archives and starts fresh
 for(const k in sstore)delete sstore[k];
 boot();await wait(30);
 ok(t('H.length')===0&&t('SES')===null&&J(R+'/sessions/'+id+'/chats/chat.json').length===4,'app kill: chat archived, fresh chat');
 // 8. unreadable session reports an error and keeps the chat
 await send('ek aur');const cur=t('SES.id');
 const msg=await t("sesOpen('nahi-hai')");
 ok(/nahi khula/.test(msg)&&t('SES.id')===cur&&t('H.length')===2,'missing session: message, current chat untouched');
 console.log(fails?'\n'+fails+' FAILED':'\nALL PASS');process.exit(fails?1:0);
})().catch(e=>{console.error('ERR',e);process.exit(1)});
