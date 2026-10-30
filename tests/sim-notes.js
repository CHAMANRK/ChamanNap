// Step12: notes + slash list. Slash command only runs after picking it from the list; typed text goes to the AI. /note search, save, edit, del, tools, guards.
const vm=require('vm'),fs=require('fs');
const els={},handlers={};
const mk=sel=>{const o={value:'',style:{},dataset:{},options:[],classList:{add(){els[sel+'#open']=1},remove(){delete els[sel+'#open']},toggle(){}},addEventListener(t,f){const k=sel+':'+t,pv=handlers[k];handlers[k]=pv?async e=>{await pv(e);await f(e)}:f},insertAdjacentHTML(){},querySelector(){return mk('x')},closest(){return null},appendChild(){},remove(){},select(){},click(){},focus(){},set onclick(f){handlers[sel+':click']=f},set onchange(f){},scrollHeight:0,scrollTop:0,disabled:false,textContent:'',srcdoc:''};let h='';Object.defineProperty(o,'innerHTML',{get(){return h},set(v){h=v;if(sel==='#prov')o.options=v.split('<option').slice(1)}});return o};
const doc={querySelector:s=>els[s]||(els[s]=mk(s)),createElement:()=>mk('c'),body:mk('body'),documentElement:{dataset:{}},addEventListener(){}};
const store={};let n=0;const bodies=[];
const tc=(id,name,args)=>({id,type:'function',function:{name,arguments:JSON.stringify(args)}});
const R='/sdcard/Chaman',ND=R+'/notes/';
const FS={};let nfetch=0;
const rej=(code,message)=>Promise.reject(Object.assign(new Error(message),{code,message}));
const files=async(m,o)=>{
 const p=o.path;
 if(m==='requestAccess')return{};
 if(m==='stat'){const t=FS[p];return{path:p,exists:t!=null,dir:false,size:t==null?0:t.length}}
 if(m==='write'){const ex=FS[p]!=null;FS[p]=o.content;return{path:p,created:!ex,backed:ex,newBytes:o.content.length,lines:o.content.split('\n').length}}
 if(m==='read'){const t=FS[p];if(t==null)return rej('NOT_FOUND','File nahi mili.');return{path:p,text:t,lines:t.split('\n').length,bytes:t.length,from:1,to:1,truncated:false}}
 if(m==='list'){const ks=Object.keys(FS).filter(k=>k.indexOf(p+'/')===0&&k.slice(p.length+1).indexOf('/')<0);if(!ks.length&&p===R+'/notes')return rej('NOT_FOUND','Folder nahi mila.');return{path:p,total:ks.length,items:ks.map(k=>({name:k.slice(p.length+1),dir:false,size:FS[k].length,mtime:0}))}}
 if(m==='trash'){const t=FS[p];delete FS[p];FS[R+'/.trash/x_'+p.split('/').pop()]=t;return{from:p,to:R+'/.trash/x',dir:false}}
 return{};
};
let script=[];
const ctx={document:doc,localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=v}},matchMedia:()=>({matches:true,addEventListener(){}}),navigator:{},console,setTimeout:(f,ms)=>{const t=setTimeout(f,ms>10000?1e9:Math.min(ms,3));if(ms>10000)t.unref();return t},clearTimeout,URL,Image:function(){},
 fetch:async(u,o)=>{nfetch++;bodies.push(JSON.parse(o.body));const s=script[n++];const msg=typeof s==='string'?{role:'assistant',content:s}:{role:'assistant',content:null,tool_calls:s};return{ok:true,status:200,json:async()=>({choices:[{message:msg}]}),text:async()=>''}}};
ctx.window=ctx;
ctx.Capacitor={nativePromise:async(pl,m,o)=>{if(pl==='Files')return files(m,o);if(pl==='Termux')return{stdout:'',exitCode:0};return{}}};
vm.createContext(ctx);
process.chdir(__dirname+'/../www');
for(const f of ['prompts','core','providers','chat','settings','attach','keys','helpers','phone','tools','termux','workspace','files','notes','slash','fast','intents','termuxapi','runner','rules','log','main'])vm.runInContext(fs.readFileSync('js/'+f+'.js','utf8'),ctx,{filename:f+'.js'});
const t=s=>vm.runInContext(s,ctx),getH=()=>t('H');
let fails=0;const ok=(c,l)=>{console.log((c?'PASS ':'FAIL ')+l);if(!c)fails++};
const typeIn=v=>{els['#in'].value=v;return handlers['#in:input']&&handlers['#in:input']({target:els['#in']})};
const pick=name=>handlers['#slash:pointerdown']({target:{closest:q=>q==='.srow'?{dataset:{c:name}}:null},preventDefault(){}});
const send=()=>handlers['#f:submit']({preventDefault(){}});
const last=()=>getH()[getH().length-1];
const CMD='mv Ja.zip ~/ && cd && unzip Ja.zip && cd chaman-nap && ls && git add . && git commit -m "Render feature" && git push';
(async()=>{
 t("S.keys.groq='k';S.prov='groq';");
 // 1. popup appears on "/", filters, hides after a space
 await typeIn('/');ok(els['#slash'].innerHTML.includes('/note')&&els['#slash'].innerHTML.includes('/provider'),'list opens on "/" with commands');
 await typeIn('/pr');ok(els['#slash'].innerHTML.includes('/provider')&&!els['#slash'].innerHTML.includes('/note'),'list filters by typing');
 await typeIn('hello /note');ok(els['#slash'].style.display==='none','no list when "/" is not at the start');
 // 2. typed by hand (not picked) -> plain text to the AI, no command
 script=['AI jawab'];n=0;nfetch=0;
 await typeIn('/note update command');await send();
 ok(nfetch===1,'typed /note without picking goes to the AI as text (fetch='+nfetch+')');
 ok(!Object.keys(FS).some(k=>k.indexOf(ND)===0),'typed /note did not touch notes');
 // 3. picked -> command runs, no AI
 nfetch=0;
 await typeIn('/n');await pick('note');ok(els['#in'].value==='/note ','pick fills "/note "');
 els['#in'].value='/note save update command: '+CMD;await handlers['#in:input']({target:els['#in']});
 await send();
 ok(nfetch===0,'picked /note save runs in the app, no AI call');
 ok(FS[ND+'update-command.md']&&FS[ND+'update-command.md'].includes('\n---\n'+CMD),'note file written with exact text');
 ok(last().content.includes(CMD)&&last().content.includes('Note save hua'),'card shows the exact text');
 ok(!t('apiMsgs(false)').some(m=>String(m.content).includes('Ja.zip')&&m.role!=='user'),'slash messages are not in AI history');
 // 4. search
 FS[ND+'wifi-password.md']='# wifi password\ntags: router\nsource: user\ncreated: x\n---\nabc123';
 FS[ND+'update-chaman-app.md']='# update chaman app\ntags: \nsource: user\ncreated: x\n---\ngit pull';
 t('NOTE_C.t=0');
 for(const q of ['update command','updte comand','command','wifi']){
   await typeIn('/note');await pick('note');els['#in'].value='/note '+q;await send();
   const l=last();console.log('   /note '+q+' ->',l.choices?'LIST '+l.choices.map(c=>c.label).join(' | '):l.content.split('\n').slice(0,2).join(' / '));
 }
 await typeIn('/note');await pick('note');els['#in'].value='/note update command';await send();
 ok(last().content.includes(CMD),'/note update command shows the exact command');
 await typeIn('/n');await pick('n');els['#in'].value='/n';await send();
 ok(last().choices&&last().choices.length===3,'/n lists all notes ('+(last().choices||[]).length+')');
 await typeIn('/n');await pick('n');els['#in'].value='/n #3';await send();
 ok(last().content.includes('```'),'/n #3 shows a note');
 // tap on a choice
 const L=getH().filter(m=>m.choices).pop();
 await handlers['#chat:click']({target:{closest:q=>q==='.nchoice'?{dataset:{s:L.choices[0].slug}}:null}});
 ok(last().content.includes('```'),'tapping a list entry shows the note');
 ok(t('render()')===undefined&&els['#chat'].innerHTML.includes('nchoice'),'render has choice buttons');
 // 5. edit / duplicate
 await typeIn('/note');await pick('note');els['#in'].value='/note save update command: other';await send();
 ok(last().content.includes('pehle se hai')&&FS[ND+'update-command.md'].includes(CMD),'save over existing name is refused');
 await typeIn('/note');await pick('note');els['#in'].value='/note edit update command: git push';await send();
 ok(FS[ND+'update-command.md'].endsWith('\n---\ngit push'),'edit replaces the text');
 await typeIn('/note');await pick('note');els['#in'].value='/note edit update command: '+CMD;await send();
 // 6. delete with confirm
 await typeIn('/note');await pick('note');els['#in'].value='/note del wifi password';
 const done=send();
 for(let i=0;i<200;i++){await new Promise(r=>setTimeout(r,5));const H=getH(),ix=H.findIndex(m=>m.confirm&&m.confirm.state==='pending');if(ix>=0){await handlers['#chat:click']({target:{closest:q=>q==='.abtn'?{dataset:{m:String(ix),o:'0'}}:null}});break}}
 await done;
 ok(FS[ND+'wifi-password.md']===undefined&&Object.keys(FS).some(k=>k.includes('.trash')),'del -> confirm -> .trash');
 // 7. AI tools: note_save verbatim
 const before=Object.keys(FS).length;
 script=[[tc('1','note_save',{name:'deploy',text:'git push origin main && echo done'})],'Saved.'];n=0;
 els['#in'].value='Ye save kar: `git push origin main && echo done` naam deploy';await send();
 ok(FS[ND+'deploy.md']&&FS[ND+'deploy.md'].endsWith('git push origin main && echo done'),'note_save with text from the user message works');
 script=[[tc('2','note_save',{name:'fake',text:'cd ~/Chaman && git pull origin main && ./install.sh'})],'x'];n=0;
 els['#in'].value='update command save kar lo bhai';await send();
 const tr=bodies[bodies.length-1].messages.filter(m=>m.role==='tool').pop();
 ok(!FS[ND+'fake.md']&&/exactly nahi mila/.test(tr.content),'note_save refuses text that is not in the user message');
 script=[[tc('3','note_save',{name:'idea',text:'AI wrote this',from_ai:true})],'x'];n=0;
 els['#in'].value='ek idea save kar';await send();
 ok(FS[ND+'idea.md']&&FS[ND+'idea.md'].includes('source: ai'),'from_ai note is marked source: ai');
 // 8. note_get: card shown by the app, AI does not get the text
 script=[[tc('4','note_get',{query:'update command'})],'Ye lo.'];n=0;
 els['#in'].value='update command do';await send();
 const tr2=bodies[bodies.length-1].messages.filter(m=>m.role==='tool').pop();
 ok(!tr2.content.includes('Ja.zip')&&/card/i.test(tr2.content),'note_get result has no note text for the AI');
 ok(getH().some(m=>m.by==='Notes'&&m.local&&m.content.includes(CMD)),'note_get card shows the command in chat');
 script=[[tc('5','note_get',{query:'zzzz qqqq'})],'Nahi mila.'];n=0;
 els['#in'].value='zzzz qqqq do';await send();
 const tr3=bodies[bodies.length-1].messages.filter(m=>m.role==='tool').pop();
 ok(/nahi mila/i.test(tr3.content)&&/update command/.test(tr3.content),'note_get miss returns names only, tells the AI not to invent');
 // 9. file tools cannot touch notes; root write blocked; created-this-turn warning
 script=[[tc('6','file_read',{path:'notes/update-command.md'}),tc('7','file_write',{path:'notes/x.md',content:'z'}),tc('8','file_write',{path:'chaman-update-command',content:'cd ~/Chaman'}),tc('9','file_write',{path:'work/p/a.txt',content:'abc'}),tc('10','file_read',{path:'work/p/a.txt'})],'ok'];n=0;
 els['#in'].value='file padho';await send();
 const tl=bodies[bodies.length-1].messages.filter(m=>m.role==='tool').map(m=>m.content);
 ok(/notes\/ Najeef/.test(tl[0])&&/notes\/ Najeef/.test(tl[1]),'file tools refuse notes/');
 ok(/Workspace root me nayi file/.test(tl[2])&&!FS[R+'/chaman-update-command'],'new file in workspace root is refused');
 ok(/CHETAVNI/.test(tl[4]),'reading a file created in the same turn carries a warning');
 // 10. rules + skill
 ok(t("ruleAreas('update command do').includes('notes')")&&t("ruleAreas('isko save kar lo').includes('notes')"),'notes rules auto-inject on keywords');
 ok(t("skillText()").includes('note_get('),'skill lists note tools');
 ok(t("logTool('note_save',{name:'x',text:'SECRET'})").indexOf('SECRET')<0,'log does not hold note text');
 console.log(fails?'\n'+fails+' FAILED':'\nALL PASS');process.exit(fails?1:0);
})().catch(e=>{console.error('ERR',e);process.exit(1)});
