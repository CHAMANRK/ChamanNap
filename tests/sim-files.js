// Step11 file tools wiring: path guard, write/edit/diff cards, shrink guard confirm, delete confirm -> trash, present card, auto card, viewer, NO_ACCESS.
// In-memory fake of the Files plugin (the real Java is tested separately).
const vm=require('vm'),fs=require('fs');
const els={},handlers={};
const mk=sel=>{const o={value:'',style:{},dataset:{},options:[],classList:{add(){els[sel+'#open']=1},remove(){delete els[sel+'#open']},toggle(){}},addEventListener(t,f){const k=sel+':'+t,pv=handlers[k];handlers[k]=pv?async e=>{await pv(e);await f(e)}:f},insertAdjacentHTML(){},querySelector(){return mk('x')},closest(){return null},appendChild(){},remove(){},select(){},click(){},set onclick(f){handlers[sel+':click']=f},set onchange(f){},scrollHeight:0,scrollTop:0,disabled:false,textContent:'',srcdoc:''};let h='';Object.defineProperty(o,'innerHTML',{get(){return h},set(v){h=v;if(sel==='#prov')o.options=v.split('<option').slice(1)}});return o};
const doc={querySelector:s=>els[s]||(els[s]=mk(s)),createElement:()=>mk('c'),body:mk('body'),documentElement:{dataset:{}},addEventListener(){}};
const store={};let n=0;const bodies=[],nlog=[];
const tc=(id,name,args)=>({id,type:'function',function:{name,arguments:JSON.stringify(args)}});
const R='/sdcard/Chaman';
const FS={};FS[R+'/work/app/index.html']='<h1>Hi</h1>\n<p>one</p>\n<p>two</p>\n<p>one</p>\n'+'x'.repeat(500);
let access=true;
const rej=(code,message)=>Promise.reject(Object.assign(new Error(message),{code,message}));
const files=async(m,o)=>{
 nlog.push('F.'+m+' '+(o.path||o.from||''));
 if(!access)return rej('NO_ACCESS','Chaman ko All files access nahi mili.');
 const p=o.path;
 if(m==='requestAccess')return{};
 if(m==='stat'){const t=FS[p];return{path:p,exists:t!=null||Object.keys(FS).some(k=>k.indexOf(p+'/')===0),dir:t==null&&Object.keys(FS).some(k=>k.indexOf(p+'/')===0),size:t==null?0:t.length}}
 if(m==='write'){const ex=FS[p]!=null,old=ex?FS[p].length:0;FS[p]=o.content;return{path:p,created:!ex,backed:ex,oldBytes:old,newBytes:o.content.length,lines:o.content.split('\n').length}}
 if(m==='edit'){let t=FS[p],lines=[];for(const e of o.edits){const c=t.split(e.old).length-1;if(!c)return rej('NO_MATCH','Edit: old text file me nahi mila. Kuch badla nahi.');if(c>1&&!o.replaceAll)return rej('MULTI','Edit: old text '+c+' jagah mila.');lines.push(1);t=o.replaceAll?t.split(e.old).join(e.new):t.replace(e.old,e.new)}const old=FS[p].length;FS[p]=t;return{path:p,changes:o.edits.length,lines,backed:true,oldBytes:old,newBytes:t.length,totalLines:t.split('\n').length,snippet:'1| '+t.split('\n')[0]}}
 if(m==='read'){const t=FS[p];if(t==null)return rej('NOT_FOUND','File nahi mili.');const L=t.split('\n');const to=Math.min(L.length,o.start+o.max-1);return{path:p,text:L.slice(o.start-1,to).join('\n'),lines:L.length,bytes:t.length,from:o.start,to,truncated:to<L.length}}
 if(m==='trash'){const t=FS[p];delete FS[p];FS[R+'/.trash/x_'+p.split('/').pop()]=t;return{from:p,to:R+'/.trash/x_'+p.split('/').pop(),dir:false}}
 if(m==='move'){FS[o.to]=FS[o.from];delete FS[o.from];return{from:o.from,to:o.to}}
 if(m==='list')return{path:p,total:2,items:[{name:'app',dir:true,size:0,mtime:0},{name:'a.txt',dir:false,size:5,mtime:0}]};
 if(m==='search')return{hits:[{file:R+'/work/app/index.html',line:2,text:'<p>one</p>'}],scanned:1,more:false};
 return{};
};
const script=[
 [tc('1','file_write',{path:'/sdcard/Chaman/work/app/new.md',content:'# Title\nhello'})],
 [tc('2','edit_file',{path:'work/app/index.html',old:'<p>one</p>',new:'<p>1</p>'})],                         // MULTI -> error text
 [tc('3','edit_file',{path:'work/app/index.html',old:'<h1>Hi</h1>',new:'<h1>Hello</h1>'})],                   // ok -> diff card
 [tc('4','file_write',{path:'work/app/index.html',content:'<h1>tiny</h1>'})],                                // shrink -> confirm (Cancel)
 [tc('5','file_read',{path:'work/app/index.html',start_line:1,max_lines:3})],
 [tc('6','file_write',{path:'/sdcard/Chaman/../x.txt',content:'z'}),tc('7','file_read',{path:'/etc/passwd'}),tc('8','file_list',{path:'~/x'})], // outside -> no native call
 [tc('9','file_delete',{path:'work/app/new.md'})],                                                            // confirm (Allow) -> trash
 [tc('10','file_present',{path:'work/app/index.html',title:'App page'}),tc('11','file_present',{path:'work/app/index.html'})], // card + duplicate
 'Ho gaya.'
];
const ctx={document:doc,localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=v}},matchMedia:()=>({matches:true,addEventListener(){}}),navigator:{},console,setTimeout:(f,ms)=>{const t=setTimeout(f,ms>10000?1e9:Math.min(ms,3));if(ms>10000)t.unref();return t},clearTimeout,URL,Image:function(){},
 fetch:async(u,o)=>{bodies.push(JSON.parse(o.body));const s=script[n++];const msg=typeof s==='string'?{role:'assistant',content:s}:{role:'assistant',content:null,tool_calls:s};return{ok:true,status:200,json:async()=>({choices:[{message:msg}]}),text:async()=>''}}};
ctx.window=ctx;
ctx.Capacitor={nativePromise:async(pl,m,o)=>{if(pl==='Files')return files(m,o);if(pl==='Termux')return{stdout:'',exitCode:0};return{}}};
vm.createContext(ctx);
process.chdir(__dirname+'/../www');
for(const f of ['prompts','core','providers','chat','settings','attach','keys','helpers','phone','tools','termux','workspace','files','fast','rules','log','main'])vm.runInContext(fs.readFileSync('js/'+f+'.js','utf8'),ctx,{filename:f+'.js'});
const getH=()=>vm.runInContext('H',ctx);
const clickWhenPending=async(o)=>{for(let i=0;i<300;i++){await new Promise(r=>setTimeout(r,5));const H=getH();const idx=H.findIndex(m=>m.confirm&&m.confirm.state==='pending');if(idx>=0){const head=H[idx].content.split('\n')[0],lab=H[idx].confirm.lab;await handlers['#chat:click']({target:{closest:q=>q==='.abtn'?{dataset:{m:String(idx),o}}:null}});return head+' | label: '+lab}}return'NO CARD'};
(async()=>{
 vm.runInContext("S.keys.groq='k';S.prov='groq';",ctx);
 const t=vm.runInContext;
 console.log('fpath rel      :',t("fpath('work/a.txt')",ctx));
 console.log('fpath storage  :',t("fpath('/storage/emulated/0/Chaman/work/a.txt')",ctx));
 console.log('fpath ..       :',JSON.stringify(t("fpath('/sdcard/Chaman/../x')",ctx)),JSON.stringify(t("fpath('work/../../x')",ctx)));
 console.log('fpath other    :',JSON.stringify(t("fpath('/sdcard/Chamanx/a')",ctx)),JSON.stringify(t("fpath('~/a')",ctx)),JSON.stringify(t("fpath('/etc/passwd')",ctx)));
 console.log('fpath root     :',t("fpath('')",ctx),t("fpath('/sdcard/Chaman/')",ctx));
 console.log('kinds          :',['a.html','b.md','c.svg','d.PNG','e.py','f'].map(x=>t("fKind('"+x+"')",ctx)).join(','));
 els['#in'].value='app ki file badlo aur dikhao';
 const done=handlers['#f:submit']({preventDefault(){}});
 console.log('card A (shrink):',await clickWhenPending('x'));
 console.log('card B (delete):',await clickWhenPending('0'));
 await done;
 const H=getH(),l=H[H.length-1];
 console.log('STEPS:\n  '+l.steps.join('\n  '));
 console.log('FINAL:',l.content);
 console.log('native calls:',nlog.join(' | '));
 console.log('tool results:');bodies.forEach((b,i)=>{const tl=b.messages.filter(m=>m.role==='tool');if(tl.length&&i===bodies.length-1)tl.forEach(x=>console.log('  -',x.content.replace(/\n/g,' / ').slice(0,170)))});
 console.log('chat cards:');H.filter(m=>m.by==='Files'||m.artifact).forEach(m=>console.log('  -',m.artifact?'ARTIFACT '+JSON.stringify(m.artifact):m.content.split('\n').slice(0,4).join(' / ')));
 console.log('artifact count:',H.filter(m=>m.artifact).length,'(expect 1)');
 console.log('FS trash has new.md:',Object.keys(FS).some(k=>k.indexOf('.trash')>0&&k.endsWith('new.md')),'| new.md gone:',FS[R+'/work/app/new.md']===undefined);
 console.log('index.html shrunk (should stay big):',FS[R+'/work/app/index.html'].length>400);
 // render + viewer
 vm.runInContext('render()',ctx);
 const html=els['#chat'].innerHTML;console.log('render has file card:',html.includes('class="afile"')&&html.includes('App page'));
 const idx=H.findIndex(m=>m.artifact);
 await handlers['#chat:click']({target:{closest:s=>s==='.afile'?{dataset:{m:String(idx)}}:null}});
 await new Promise(r=>setTimeout(r,20));
 console.log('viewer open:',!!els['#viewer#open'],'| iframe set:',els['#viewer-body'].innerHTML.includes('vfr'),'| srcdoc has Hello:',els['#vfr']&&els['#vfr'].srcdoc.includes('Hello'));
 await handlers['#vmode:click']&&handlers['#vmode:click']();
 console.log('code mode shows source:',els['#viewer-body'].innerHTML.includes('&lt;h1&gt;Hello'));
 // auto card when AI forgot present
 n=script.length;script.push([tc('12','file_write',{path:'work/app/auto.html',content:'<p>auto</p>'})],'Banaya.');
 els['#in'].value='ek page banao';
 const before=H.filter(m=>m.artifact).length;
 await handlers['#f:submit']({preventDefault(){}});
 console.log('auto card added:',getH().filter(m=>m.artifact).length-before===1,'->',getH().filter(m=>m.artifact).pop().artifact.name);
 // no access
 access=false;n=script.length;script.push([tc('13','file_read',{path:'work/app/index.html'})],'Access chahiye.');
 els['#in'].value='file padho';
 await handlers['#f:submit']({preventDefault(){}});
 const L=getH().slice(-1)[0];console.log('NO_ACCESS step:',L.steps.join(' / ').slice(0,160));
 console.log('requestAccess called:',nlog.some(x=>x.startsWith('F.requestAccess')));
 // log redaction
 console.log('log redaction :',vm.runInContext("logTool('file_write',{path:'work/a',content:'SECRET'})",ctx),'|',vm.runInContext("logTool('edit_file',{path:'work/a',old:'S',new:'T'})",ctx));
 console.log('skill mentions files:',vm.runInContext("skillText()",ctx).includes('edit_file('),'| rules files area:',vm.runInContext("ruleAreas('file edit karo')",ctx).join(','));
 console.log('prompt migration:',vm.runInContext("S.system===DEF_SYS && DEF_SYS.includes('file_present')",ctx));
})().catch(e=>{console.error('ERR',e);process.exit(1)});
