// 1.38000.0 Rich UI (P1): validator, renderer (escaping), ```ui fences, live/frozen/replace, ui_render tool + loop, taps (send/copy/sort/form), rules. Run: cd www && node ../tests/sim-ui.js
const vm=require('vm'),fs=require('fs');
const els={},handlers={};
const mk=sel=>{const o={value:'',style:{},dataset:{},options:[],classList:{add(){},remove(){},toggle(){},contains(){return false}},addEventListener(t,f){const k=sel+':'+t,pv=handlers[k];handlers[k]=pv?async e=>{await pv(e);await f(e)}:f},insertAdjacentHTML(){},querySelector(){return mk('x')},closest(){return null},appendChild(){},remove(){},select(){},click(){},focus(){},set onclick(f){handlers[sel+':click']=f},set onchange(f){},scrollHeight:0,scrollTop:0,disabled:false,textContent:'',srcdoc:''};let h='';Object.defineProperty(o,'innerHTML',{get(){return h},set(v){h=v;if(sel==='#prov')o.options=v.split('<option').slice(1)}});return o};
const doc={querySelector:s=>els[s]||(els[s]=mk(s)),createElement:()=>mk('c'),body:mk('body'),documentElement:{dataset:{}},addEventListener(){}};
const store={};let n=0;const bodies=[];let script=[];let copied=null;
const ctx={document:doc,localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=v}},matchMedia:()=>({matches:true,addEventListener(){}}),navigator:{clipboard:{writeText:async t=>{copied=t}}},console,setTimeout:(f,ms)=>{const t=setTimeout(f,ms>10000?1e9:Math.min(ms,3));if(ms>10000)t.unref();return t},clearTimeout,URL,Image:function(){},Event:function(t){this.type=t},
 fetch:async(u,o)=>{bodies.push(JSON.parse(o.body));const s=script[n++];if(s===undefined)return{ok:false,status:500,text:async()=>'no script',json:async()=>({})};const msg=typeof s==='string'?{role:'assistant',content:s}:{role:'assistant',content:null,tool_calls:s};return{ok:true,status:200,json:async()=>({choices:[{message:msg}]}),text:async()=>''}}};
ctx.window=ctx;
ctx.Capacitor={nativePromise:async()=>({})};
vm.createContext(ctx);
process.chdir(__dirname+'/../www');
for(const f of ['prompts','core','status','providers','chat','settings','attach','keys','helpers','phone','tools','termux','workspace','files','notes','slash','fast','intents','termuxapi','runner','crules','ui','rules','log','main'])vm.runInContext(fs.readFileSync('js/'+f+'.js','utf8'),ctx,{filename:f+'.js'});
const t=s=>vm.runInContext(s,ctx),getH=()=>t('H');
let fails=0;const ok=(c,l)=>{console.log((c?'PASS ':'FAIL ')+l);if(!c)fails++};
const tc=(id,name,args)=>({id,type:'function',function:{name,arguments:JSON.stringify(args)}});
let sending=null;
els['#f']=els['#f']||mk('#f');els['#f'].dispatchEvent=()=>{sending=handlers['#f:submit']({preventDefault(){}})};
const V=o=>t('uiValidate')(o);
const Q={v:1,id:'quiz-1',title:'Quiz',blocks:[{type:'text',md:'2+3 = ?'},{type:'choice',id:'q',mode:'single',options:[{label:'4',value:'A'},{label:'5',value:'B'},{label:'6',value:'C'}]}]};
// fake DOM for taps
const fakeW=(key,live,fields)=>{const w={dataset:{ui:key,live:live?'1':'0'},outerHTML:'',querySelectorAll:()=>fields||[],querySelector:q=>{const b=(q.match(/data-b="(\d+)"/)||[])[1],k=(q.match(/data-k="([^"]+)"/)||[])[1];if(k)return(fields||[]).find(f=>f.dataset.k===k&&f.dataset.b===b)||null;const e=(q.match(/data-e="(\d+)"/)||[])[1];if(e){w.err=w.err||{textContent:''};return w.err}return null}};return w};
const tap=async(w,ua,b,i)=>{const el={dataset:{ua,b:String(b),i:String(i)},disabled:false,textContent:'x',isConnected:false,closest:q=>q==='.uiw'?w:q==='[data-ua]'?el:null};await handlers['#chat:click']({target:{closest:q=>el.closest(q)}});if(sending){const s=sending;sending=null;await s}};
const lastUser=()=>{const h=getH();for(let k=h.length-1;k>=0;k--)if(h[k].role==='user')return h[k];return null};
(async()=>{
 t("S.keys.groq='k';S.prov='groq';");
 // ---- 1. validator
 let r=V(Q);ok(r.ok&&r.ui.id==='quiz-1'&&r.ui.blocks.length===2,'valid widget accepted');
 r=V({v:1,blocks:[{type:'text',md:'a'},{type:'chart',data:[1]},{type:'html',code:'<script>x</script>'},{type:'diagram'},{type:'nope'},5,null]});
 ok(r.ok&&r.ui.blocks.length===1&&r.ui.skipped===6,'unknown and later-phase block types are skipped silently ('+(r.ui&&r.ui.skipped)+')');
 ok(V({v:1,blocks:[{type:'chart'}]}).ok===false,'only unknown blocks = invalid');
 ok(!V('{bad json').ok&&/JSON/.test(V('{bad json').err),'bad JSON text rejected');
 ok(!V({v:2,blocks:[{type:'text',md:'a'}]}).ok,'v must be 1');
 ok(!V({v:1}).ok&&!V({v:1,blocks:[]}).ok,'blocks list needed');
 r=V({v:1,id:'My Quiz_#1!',blocks:[{type:'text',md:'a'}]});ok(r.ok&&r.ui.id==='my-quiz-1','id is normalised to a-z0-9-');
 r=V({v:1,blocks:[{type:'text',md:'a'}]});ok(r.ok&&/^w\d+$/.test(r.ui.id),'missing id gets an automatic one');
 ok(!V({v:1,blocks:Array(61).fill({type:'divider'})}).ok,'61 blocks rejected');
 ok(!V({v:1,blocks:[{type:'table',columns:[{key:'a'}],rows:Array(100).fill({a:'x'})},{type:'table',columns:[{key:'a'}],rows:Array(100).fill({a:'x'})},{type:'table',columns:[{key:'a'}],rows:Array(100).fill({a:'x'})}]}).ok,'more than 300 elements rejected');
 ok(!V({v:1,blocks:[{type:'text',md:'x'.repeat(2001)}]}).ok&&V({v:1,blocks:[{type:'text',md:'x'.repeat(2000)}]}).ok,'string limit is 2000');
 ok(!V({v:1,blocks:[{type:'text',md:'x'.repeat(1990)},{type:'text',md:'y'.repeat(1990)},...Array(15).fill({type:'text',md:'z'.repeat(1990)})]}).ok,'JSON over 32 KB rejected');
 let deep={type:'divider'};for(let i=0;i<6;i++)deep={type:'card',body:[deep]};ok(!V({v:1,blocks:[deep]}).ok,'nesting over 5 rejected');
 let d5={type:'divider'};for(let i=0;i<4;i++)d5={type:'card',body:[d5]};ok(V({v:1,blocks:[d5]}).ok,'nesting 5 ok');
 r=V({v:1,blocks:[{type:'buttons',items:[{label:'Open',action:{type:'open',value:'https://x'}},{label:'Call',action:{type:'call',value:'1'}},{label:'Go',action:{type:'send',value:'go',silent:true}},{label:'Cp',action:{type:'copy',value:'abc'}},{label:''}]}]});
 ok(r.ok&&r.ui.blocks[0].items.length===4&&r.ui.blocks[0].items[0].action.type==='none'&&r.ui.blocks[0].items[1].action.type==='none','open/call/other actions become "none" in v1');
 ok(r.ui.blocks[0].items[2].action.silent===true&&r.ui.blocks[0].items[3].action.type==='copy','send (silent) and copy kept');
 r=V({v:1,blocks:[{type:'choice',options:[]},{type:'form',fields:[{key:'bad key!'}]},{type:'table',columns:[],rows:[]},{type:'text',md:'ok'}]});
 ok(r.ok&&r.ui.blocks.length===1,'empty choice/form/table are dropped');
 r=V({v:1,blocks:[{type:'table',columns:[{key:'__proto__'},{key:'n',type:'number'}],rows:[JSON.parse('{"__proto__":"P","n":5}'),{n:2}]}]});
 ok(r.ok&&r.ui.blocks[0].rows[0][0]==='P'&&r.ui.blocks[0].rows[1][0]==='','table cells use own properties only');
 // ---- 2. rendering and escaping
 const XSS='<script>alert(1)</script><img src=x onerror=alert(1)>"\'';
 r=V({v:1,id:'x',title:XSS,blocks:[{type:'text',md:XSS},{type:'card',title:XSS,subtitle:XSS,body:[{type:'alert',title:XSS,md:XSS}]},{type:'buttons',items:[{label:XSS,action:{type:'send',value:XSS}}]},{type:'choice',options:[{label:XSS,value:XSS,desc:XSS}],submit:{label:XSS}},{type:'form',fields:[{key:'a',label:XSS,placeholder:XSS,type:'text'},{key:'s',label:'s',type:'select',options:[XSS]}],submit:{label:XSS}},{type:'table',columns:[{key:'a',label:XSS}],rows:[{a:XSS}]},{type:'keyvalue',rows:[{k:XSS,v:XSS}]},{type:'progress',label:XSS,value:'<b>',max:'x'},{type:'code',lang:'<x>',code:XSS}]});
 ok(r.ok,'xss widget validates');
 const html=t('(r)=>uiW(r.ui,"1:0","live")')(r);
 ok(html.indexOf('&lt;script&gt;')>0&&html.indexOf('&quot;')>0&&html.indexOf('&#39;')>0,'texts are escaped (tags, double and single quotes)');
 const TAGS=new Set('div span b small button input select option textarea label table thead tbody tr th td hr pre code i br blockquote del svg path rect'.split(' '));
 const ATTR=new Set('class data-ui data-live data-ua data-b data-i data-d data-uf data-k data-e role aria-checked aria-valuemin aria-valuemax aria-valuenow type style disabled checked selected value placeholder maxlength min max rows tabindex inputmode aria-label viewBox d x y width height rx'.split(' '));
 let badTag='',badAttr='',nt=0;
 for(const m of html.matchAll(/<\/?([a-zA-Z0-9]+)((?:\s+[a-zA-Z-]+(?:="[^"<>]*")?)*)\s*\/?>/g)){nt++;if(!TAGS.has(m[1].toLowerCase()))badTag=m[1];for(const a of m[2].matchAll(/\s+([a-zA-Z-]+)(?:="([^"]*)")?/g)){if(!ATTR.has(a[1]))badAttr=a[1];if(a[1]==='style'&&!/^(text-align:(left|right|center)|width:[\d.]+%)$/.test(a[2]))badAttr='style='+a[2]}}
 ok(html.replace(/<\/?[a-zA-Z0-9]+(?:\s+[a-zA-Z-]+(?:="[^"<>]*")?)*\s*\/?>/g,'').indexOf('<')<0,'every "<" in the output belongs to a well-formed whitelisted tag ('+nt+' tags), injected text has none');
 ok(!badTag,'only whitelisted tag names (bad: '+badTag+')');
 ok(!badAttr,'only whitelisted attributes, style only the fixed ones (bad: '+badAttr+')');
 ok(/aria-valuenow="0"/.test(html)&&!/NaN/.test(html),'progress with bad numbers is safe (0)');
 // ---- 3. fences in normal replies
 const F=JSON.stringify(Q);
 let o=t('fmt')('Ye lo:\n```ui\n'+F+'\n```\nBas.');
 ok(/class="uiw/.test(o)&&/2\+3 = \?/.test(o)&&!/<pre>/.test(o),'valid closed ```ui fence renders as a widget (no code block)');
 o=t('fmt')('```ui\n{"v":1,"blocks":[}\n```');ok(/<pre>/.test(o)&&/invalid ui/.test(o)&&/class="cp"/.test(o),'invalid ui fence = code block with copy button + "invalid ui" line');
 o=t('fmt')('```ui\n'+F.slice(0,40));ok(/<pre>/.test(o)&&/poora nahi/.test(o)&&!/uiw/.test(o),'unclosed ui fence stays code (no widget while it is incomplete)');
 o=t('fmt')('```js\nlet a=1\n```');ok(/<pre>/.test(o)&&!/uierr/.test(o),'normal code fence unchanged');
 o=t('fmt')('```ui\n'+F+'\n```\ntext\n```ui\n'+F+'\n```');ok((o.match(/class="uiw/g)||[]).length===2,'two fences = two widgets');
 // ---- 4. live / frozen / old
 const setH=a=>{const HH=t('H');HH.length=0;a.forEach(m=>HH.push(m));t('uiScan()')};
 const W=(id,keep)=>({role:'assistant',local:1,content:'',aiNote:'w',ui:{v:1,id,keep:!!keep,blocks:[{type:'text',md:id}]}});
 const st=k=>t('UI_INFO')[k];
 setH([{role:'user',content:'quiz'},W('a')]);ok(st('1:0')==='live','newest widget is live');
 setH([{role:'user',content:'quiz'},W('a'),{role:'user',content:'B'}]);ok(st('1:0')==='frozen','a user message freezes it');
 setH([{role:'user',content:'q'},W('a'),{role:'user',content:'B'},W('b')]);ok(st('1:0')==='frozen'&&st('3:0')==='live','older frozen, newest live');
 setH([{role:'user',content:'q'},W('a',true),{role:'user',content:'B'},W('b')]);ok(st('1:0')==='live'&&st('3:0')==='live','keep:true stays live');
 setH([{role:'user',content:'q'},W('a'),{role:'user',content:'B'},W('a')]);ok(st('1:0')==='old'&&t('uiHide')(getH()[1],1)&&!t('uiHide')(getH()[3],3),'same id replaces the older widget (old one hidden)');
 setH([{role:'user',content:'q'},{role:'assistant',content:'a\n```ui\n'+F+'\n```'},{role:'user',content:'B'},{role:'assistant',content:'b\n```ui\n'+F+'\n```'}]);
 ok(st('1:0')==='old'&&st('3:0')==='live','fenced widgets follow the same rules');
 t('UI_HI=1;UI_K=0');o=t('fmt')(getH()[1].content);ok(/Ye widget neeche update/.test(o)&&!/uiw/.test(o),'replaced fenced widget shows a one-line note');
 // ---- 5. ui_render tool inside the agent loop
 setH([]);t('PEND=[]');script=[[tc('c1','ui_render',Q)],''];n=0;bodies.length=0;
 els['#in'].value='quiz lo';await handlers['#f:submit']({preventDefault(){}});
 let h=getH();
 ok(h.length===2&&h[1].ui&&h[1].ui.id==='quiz-1','tool call put a widget message in the chat');
 ok(h.filter(m=>m.role==='assistant').length===1&&h[1].steps&&h[1].steps.some(x=>/Widget dikhaya/.test(x)),'empty final reply: no extra text bubble, steps kept on the widget message');
 ok(!h.some(m=>m.content==='(khaali jawab)'),'no "(khaali jawab)" bubble after a widget');
 ok(!h.some(m=>m.err),'empty reply after ui_render is not a provider failure');
 ok(bodies[0].tools.some(x=>x.function.name==='ui_render'),'ui_render is in the tool list');
 ok(/quiz/i.test(bodies[0].messages[0].content)&&/WIDGETS/.test(bodies[0].messages[0].content),'"quiz" message adds the ui rules to the instructions');
 const am=t('apiMsgs(false)');ok(am.some(m=>m.role==='assistant'&&/\[app log\] Widget dikhaya \(id quiz-1\).*2\+3 = \?.*choice\[/.test(m.content)),'AI sees what widget it showed (question + options) in history');
 // invalid widget -> error to the AI, no widget
 setH([]);script=[[tc('c1','ui_render',{v:1,blocks:[{type:'chart'}]})],'theek hai, text me:\n2+3 = ?'];n=0;bodies.length=0;
 els['#in'].value='quiz';await handlers['#f:submit']({preventDefault(){}});h=getH();
 const toolMsg=bodies[1].messages.filter(m=>m.role==='tool').pop();
 ok(!h.some(m=>m.ui)&&/valid nahi/.test(toolMsg.content),'invalid widget: nothing shown, the AI is told why');
 ok(h[h.length-1].content.indexOf('2+3')>=0,'AI can fall back to text after an invalid widget');
 // log must not carry widget content
 ok(t("logTool('ui_render',{id:'quiz-1',blocks:[{type:'text',md:'SECRET'}]})")==='ui_render quiz-1 (1 blocks)','log line has id + block count only');
 // ---- 6. render() output
 setH([{role:'user',content:'quiz'},W('a'),{role:'user',content:'Up',chip:'Up'},{role:'assistant',content:'x\n```ui\n'+F+'\n```'}]);t('render()');
 const rh=els['#chat'].innerHTML;
 ok(/uichip">Up</.test(rh)&&!/>Up<\/div><div class="msg me">/.test(rh)||/uichip">Up</.test(rh),'silent tap shows a chip, not a bubble');
 ok(/data-ui="3:0" data-live="1"/.test(rh)&&/data-ui="1:0" data-live="0"/.test(rh),'render marks live and frozen widgets');
 setH([{role:'user',content:'q'},W('a'),{role:'user',content:'B'},W('a')]);t('render()');
 ok((els['#chat'].innerHTML.match(/class="uiw/g)||[]).length===1,'replaced widget message is not drawn at all');
 // ---- 7. taps
 // choice single, no submit: tap sends the value at once
 setH([{role:'user',content:'quiz'},{role:'assistant',local:1,content:'',aiNote:'w',ui:JSON.parse(JSON.stringify(Q))}]);t('render()');script=['sahi'];n=0;
 await tap(fakeW('1:0',true),'opt',2,1);
 ok(lastUser()&&lastUser().content==='B','tapping option "5" sends its value "B" as the user message');
 ok(!lastUser().chip,'normal send has no chip');
 // frozen / busy: no send
 setH([{role:'user',content:'q'},{role:'assistant',local:1,content:'',aiNote:'w',ui:JSON.parse(JSON.stringify(Q))},{role:'user',content:'B'}]);t('render()');const len=getH().length;
 await tap(fakeW('1:0',false),'opt',2,0);ok(getH().length===len,'frozen widget: tap does nothing');
 // choice multi + submit with placeholders
 const M={v:1,id:'m',blocks:[{type:'choice',mode:'multi',options:[{label:'Chai',value:'tea'},{label:'Doodh',value:'milk'},'Pani'],submit:{label:'OK',action:{type:'send',value:'Mujhe {values} chahiye ({labels})'}}}]};
 setH([{role:'user',content:'x'},{role:'assistant',local:1,content:'',aiNote:'w',ui:M}]);t('render()');script=['ok'];n=0;
 await tap(fakeW('1:0',true),'sub',1,0);ok(getH().length===2,'submit with nothing selected does not send');
 await tap(fakeW('1:0',true),'opt',1,0);await tap(fakeW('1:0',true),'opt',1,2);
 await tap(fakeW('1:0',true),'sub',1,0);
 ok(lastUser().content==='Mujhe tea, Pani chahiye (Chai, Pani)','multi choice: {values} and {labels} filled in');
 // buttons: silent send, copy, none
 const B={v:1,id:'b',blocks:[{type:'buttons',items:[{label:'Up',action:{type:'send',value:'move:up',silent:true}},{label:'Copy',action:{type:'copy',value:'abc 123'}},{label:'Nothing',action:{type:'open',value:'x'}}]}]};
 setH([{role:'user',content:'x'},{role:'assistant',local:1,content:'',aiNote:'w',ui:B}]);t('render()');script=['ok'];n=0;
 await tap(fakeW('1:0',true),'btn',1,0);ok(lastUser().content==='move:up'&&lastUser().chip==='Up','silent send: AI gets the value, chat shows chip "Up"');
 setH([{role:'user',content:'x'},{role:'assistant',local:1,content:'',aiNote:'w',ui:B}]);t('render()');const l2=getH().length;
 await tap(fakeW('1:0',true),'btn',1,1);await new Promise(r=>setTimeout(r,10));ok(copied==='abc 123'&&getH().length===l2,'copy action copies and sends nothing');
 await tap(fakeW('1:0',true),'btn',1,2);ok(getH().length===l2,'"open" action does nothing in v1');
 copied=null;await tap(fakeW('1:0',false),'btn',1,1);await new Promise(r=>setTimeout(r,10));ok(copied==='abc 123','copy button still works on a frozen widget');
 // form
 const FM={v:1,id:'f',blocks:[{type:'form',fields:[{key:'naam',label:'Naam',type:'text',required:true},{key:'umar',label:'Umar',type:'number',min:1,max:120},{key:'chai',label:'Chai',type:'switch'}],submit:{label:'Bhejo'}}]};
 const fld=(k,b,v,type,checked)=>({dataset:{uf:'1',b:String(b),k},type:type||'text',value:v,checked:!!checked});
 setH([{role:'user',content:'x'},{role:'assistant',local:1,content:'',aiNote:'w',ui:FM}]);t('render()');script=['ok'];n=0;const l3=getH().length;
 let w=fakeW('1:0',true,[fld('naam',1,'  ','text'),fld('umar',1,'30','number'),fld('chai',1,'on','checkbox',true)]);
 await tap(w,'sub',1,0);ok(getH().length===l3&&/zaroori/.test(w.err.textContent),'required field empty: inline error, nothing sent');
 w=fakeW('1:0',true,[fld('naam',1,'Najeef','text'),fld('umar',1,'500','number'),fld('chai',1,'on','checkbox',true)]);
 await tap(w,'sub',1,0);ok(getH().length===l3&&/1 se 120/.test(w.err.textContent),'number out of range: inline error');
 w=fakeW('1:0',true,[fld('naam',1,'Najeef','text'),fld('umar',1,'30','number'),fld('chai',1,'on','checkbox',true)]);
 await tap(w,'sub',1,0);ok(lastUser().content==='Naam: Najeef\nUmar: 30\nChai: on','form sends "label: value" lines by default');
 // sortable table
 const TB={v:1,id:'t',blocks:[{type:'table',sortable:true,columns:[{key:'n',label:'Naam'},{key:'p',label:'Price',type:'number'}],rows:[{n:'b',p:'10'},{n:'a',p:'9'},{n:'c',p:'100'}]}]};
 setH([{role:'user',content:'x'},{role:'assistant',local:1,content:'',aiNote:'w',ui:TB}]);t('render()');
 const colOf=h=>[...h.matchAll(/<td style="text-align:right">(\d+)<\/td>/g)].map(x=>x[1]).join(',');
 ok(colOf(els['#chat'].innerHTML)==='10,9,100','table starts in given order');
 const w2=fakeW('1:0',true);
 await tap(w2,'sort',1,1);ok(colOf(w2.outerHTML)==='9,10,100','sort by a number column is numeric (9,10,100), not text (10,100,9)');
 await tap(w2,'sort',1,1);ok(colOf(w2.outerHTML)==='100,10,9','second tap = descending');
 await tap(w2,'sort',1,1);ok(colOf(w2.outerHTML)==='10,9,100','third tap = original order');
 const w3=fakeW('1:0',false);await tap(w3,'sort',1,0);ok(/<td style="text-align:left">a<\/td>[^]*<td style="text-align:left">b<\/td>[^]*<td style="text-align:left">c<\/td>/.test(w3.outerHTML),'sorting a text column works (and also on a frozen widget)');
 // ---- 8. rules / skill / enum
 ok(t("ruleAreas('ek quiz lo mera')").includes('ui')&&t("ruleAreas('torch on kar')").includes('ui')===false,'rule area "ui" is picked for quiz, not for torch');
 ok(/ui_render/.test(t("rulesTool({area:'ui'},s=>s,{})")),'rules_read ui works');
 ok(t("TOOLS.find(x=>x.function.name==='rules_read').function.parameters.properties.area.enum").includes('ui'),'rules_read enum has ui');
 ok(/ui_render/.test(t('skillText()')),'skill text lists ui_render');
 ok(t("RULES_VER")==='2026-11-21.1','RULES_VER bumped');
 ok(/```ui/.test(t("RULES.ui"))&&/HE says/.test(t("RULES.ui")),'rules tell the AI about the fence fallback and that a button value is Najeef\'s words');
 // ---- 9. switch off
 t("S.ui={off:true}");o=t('fmt')('```ui\n'+F+'\n```');ok(/<pre>/.test(o)&&/off hai/.test(o),'Rich UI off: fence stays code');
 t("S.ui={}");
 console.log(fails?'\nFAILED '+fails:'\nALL PASS');process.exit(fails?1:0);
})();
