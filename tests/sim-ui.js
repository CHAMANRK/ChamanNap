// 1.38000.0 Rich UI (P1): validator, renderer (escaping), ```ui fences, live/frozen/replace, ui_render tool + loop, taps (send/copy/sort/form), rules. Run: cd www && node ../tests/sim-ui.js
const vm=require('vm'),fs=require('fs');
const els={},handlers={};
const mk=sel=>{const o={value:'',style:{},dataset:{},options:[],classList:{add(){},remove(){},toggle(){},contains(){return false}},addEventListener(t,f){const k=sel+':'+t,pv=handlers[k];handlers[k]=pv?async e=>{await pv(e);await f(e)}:f},insertAdjacentHTML(){},querySelector(){return mk('x')},closest(){return null},appendChild(){},remove(){},select(){},click(){},focus(){},set onclick(f){handlers[sel+':click']=f},set onchange(f){},scrollHeight:0,scrollTop:0,disabled:false,textContent:'',srcdoc:''};let h='';Object.defineProperty(o,'innerHTML',{get(){return h},set(v){h=v;if(sel==='#prov')o.options=v.split('<option').slice(1)}});return o};
const doc={querySelector:s=>els[s]||(els[s]=mk(s)),createElement:()=>mk('c'),body:mk('body'),documentElement:{dataset:{}},addEventListener(){}};
const store={};let n=0;const bodies=[];let script=[];let copied=null;
const ctx={document:doc,localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=v}},matchMedia:()=>({matches:true,addEventListener(){}}),navigator:{clipboard:{writeText:async t=>{copied=t}}},console,setTimeout:(f,ms)=>{const t=setTimeout(f,ms>10000?1e9:Math.min(ms,3));if(ms>10000)t.unref();return t},clearTimeout,setInterval,clearInterval,URL,Image:function(){},Event:function(t){this.type=t},
 fetch:async(u,o)=>{bodies.push(JSON.parse(o.body));const s=script[n++];if(s===undefined)return{ok:false,status:500,text:async()=>'no script',json:async()=>({})};const msg=typeof s==='string'?{role:'assistant',content:s}:{role:'assistant',content:null,tool_calls:s};return{ok:true,status:200,json:async()=>({choices:[{message:msg}]}),text:async()=>''}}};
ctx.window=ctx;
let b64reply={b64:'AAAA',mime:'image/png'};const nreads=[];
ctx.Capacitor={nativePromise:async(pl,m,o)=>{if(pl==='Files'&&m==='readB64'){nreads.push(o.path);if(!b64reply)throw new Error('nofile');return b64reply}return{}}};
vm.createContext(ctx);
process.chdir(__dirname+'/../www');
for(const f of ['prompts','core','status','providers','chat','settings','attach','keys','helpers','phone','tools','termux','workspace','files','notes','slash','fast','intents','termuxapi','runner','crules','imagegen','ui','rules','log','main'])vm.runInContext(fs.readFileSync('js/'+f+'.js','utf8'),ctx,{filename:f+'.js'});
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
 const TAGS=new Set('div span b small button input select option textarea label table thead tbody tr th td hr pre code i br blockquote del svg path rect img figure figcaption line text polyline circle title'.split(' '));
 const ATTR=new Set('class data-ui data-live data-ua data-b data-i data-d data-uf data-k data-e role aria-checked aria-valuemin aria-valuemax aria-valuenow type style disabled checked selected value placeholder maxlength min max rows tabindex inputmode aria-label viewBox d x y width height rx src alt data-isrc x1 x2 y1 y2 text-anchor transform points cx cy r fill'.split(' '));
 let badTag='',badAttr='',nt=0;
 for(const m of html.matchAll(/<\/?([a-zA-Z0-9]+)((?:\s+[a-zA-Z-]+(?:="[^"<>]*")?)*)\s*\/?>/g)){nt++;if(!TAGS.has(m[1].toLowerCase()))badTag=m[1];for(const a of m[2].matchAll(/\s+([a-zA-Z-]+)(?:="([^"]*)")?/g)){if(!ATTR.has(a[1]))badAttr=a[1];if(a[1]==='style'&&!/^(text-align:(left|right|center)|width:[\d.]+%|(max-)?height:\d+px)$/.test(a[2]))badAttr='style='+a[2]}}
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
 const setH=(a,stale)=>{const HH=t('H');HH.length=0;a.forEach(m=>{HH.push(m);if(!stale)t('uiFresh')(m)});t('uiScan()')};
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
 // ---- 7b. P2: chart
 const CH={v:1,id:'c',blocks:[{type:'chart',kind:'bar',title:'Kharcha',unit:'Rs',labels:['Jan','Feb','Mar'],series:[{name:'Khana',values:[100,250,'x']},{name:'Safar',values:[40,NaN,90]}]}]};
 r=V(CH);ok(r.ok&&r.ui.blocks[0].series[0].values.join()==='100,250,0'&&r.ui.blocks[0].series[1].values.join()==='40,0,90','chart: non-numbers become 0');
 let ch=t('(r)=>uiW(r.ui,"1:0","live")')(r);
 ok((ch.match(/<rect /g)||[]).length===4&&/<svg/.test(ch)&&!/NaN|undefined|Infinity/.test(ch),'bar chart: one rect per non-zero value (4), no NaN in the SVG');
 ok((ch.match(/<span><i class="c\d"/g)||[]).length===2&&/Khana/.test(ch),'bar chart: legend for 2 series');
 r=V({v:1,id:'l',blocks:[{type:'chart',kind:'line',labels:['a','b','c','d'],series:[{name:'x',values:[1,3,2,5]},{name:'y',values:[2,2,2,2]}]}]});
 ch=t('(r)=>uiW(r.ui,"1:0","live")')(r);ok((ch.match(/<polyline /g)||[]).length===2&&(ch.match(/<circle /g)||[]).length===8,'line chart: 2 lines, 8 points');
 r=V({v:1,id:'p',blocks:[{type:'chart',kind:'pie',labels:['A','B','C'],series:[{name:'s',values:[50,30,-5]}]}]});
 ch=t('(r)=>uiW(r.ui,"1:0","live")')(r);ok((ch.match(/<path /g)||[]).length===2&&/62%|80%|63%/.test(ch)&&!/NaN/.test(ch),'pie: negative value ignored, 2 slices, percentages in legend');
 r=V({v:1,id:'p1',blocks:[{type:'chart',kind:'pie',labels:['A','B'],series:[{values:[7,0]}]}]});
 ch=t('(r)=>uiW(r.ui,"1:0","live")')(r);ok(/<circle class="c0"/.test(ch)&&!/<path /.test(ch),'pie with one slice = full circle');
 r=V({v:1,id:'p0',blocks:[{type:'chart',kind:'pie',labels:['A'],series:[{values:[0]}]}]});
 ok(/data khaali/.test(t('(r)=>uiW(r.ui,"1:0","live")')(r)),'pie with no data: message, no crash');
 ok(!V({v:1,blocks:[{type:'chart',labels:[],series:[]},{type:'chart',labels:['a'],series:[]}]}).ok,'chart without labels or series is dropped');
 r=V({v:1,blocks:[{type:'chart',kind:'weird',labels:Array.from({length:40},(_,i)=>'l'+i),series:Array.from({length:9},()=>({values:[1]}))}]});
 ok(r.ok&&r.ui.blocks[0].kind==='bar'&&r.ui.blocks[0].labels.length===24&&r.ui.blocks[0].series.length===6,'chart: unknown kind = bar, 24 labels and 6 series max');
 r=V({v:1,blocks:[{type:'chart',kind:'bar',title:XSS,labels:[XSS,'b'],series:[{name:XSS,values:[-5,10]}]}]});
 ch=t('(r)=>uiW(r.ui,"1:0","live")')(r);ok(!/<script|<img/i.test(ch)&&ch.indexOf('&lt;')>0,'chart texts are escaped');
 ok(/<rect[^>]*height="[\d.]+"/.test(ch),'negative bar draws');
 // board
 r=V({v:1,id:'b',blocks:[{type:'board',rows:['X.O','.X.','O.X'],legend:'X = tum <b>',size:'lg'},{type:'board',rows:[]}]});
 ok(r.ok&&r.ui.blocks.length===1,'board: empty board dropped');
 ch=t('(r)=>uiW(r.ui,"1:0","live")')(r);ok(/uibd lg/.test(ch)&&/X\.O\n\.X\.\nO\.X/.test(ch)&&/&lt;b&gt;/.test(ch),'board: rows kept line by line, legend escaped');
 ok(!V({v:1,blocks:[{type:'board',rows:['x'.repeat(81)]}]}).ok,'board row longer than 80 rejected');
 // image
 const IP=src=>{const r=V({v:1,blocks:[{type:'image',src},{type:'text',md:'t'}]});return r.ok&&r.ui.blocks[0].type==='image'?r.ui.blocks[0].src:null};
 ok(IP('/sdcard/Chaman/work/a.png')==='/sdcard/Chaman/work/a.png','image: workspace path ok');
 ok(IP('work/b.JPG')==='/sdcard/Chaman/work/b.JPG','image: relative path is placed in the workspace');
 ok(IP('gen:abc_12')==='gen:abc_12','image: gen:<id> ok');
 ok(IP('/sdcard/Chaman/notes/x.png')===null,'image: notes/ is closed');
 ok(IP('/sdcard/DCIM/x.png')===null&&IP('/etc/x.png')===null,'image: outside the workspace rejected');
 ok(IP('/sdcard/Chaman/../x.png')===null&&IP('work/../../x.png')===null,'image: .. rejected');
 ok(IP('/sdcard/Chaman/work/a.html')===null&&IP('/sdcard/Chaman/work/a.txt')===null&&IP('https://x.com/a.png')===null&&IP('data:image/png;base64,AAAA')===null&&IP('javascript:alert(1)')===null,'image: only picture files, no urls / data / javascript');
 ok(IP('gen:a b')===null&&IP('')===null,'image: bad gen id / empty rejected');
 r=V({v:1,blocks:[{type:'image',src:'work/a.png',alt:XSS,caption:XSS,height:9999}]});
 ok(r.ui.blocks[0].height===600,'image height capped at 600');
 t("UI_IMG.clear()");nreads.length=0;b64reply={b64:'AAAA',mime:'image/png'};
 let ih=t('(r)=>uiW(r.ui,"1:0","live")')(r);ok(/uiimg ph/.test(ih)&&/data-isrc/.test(ih)&&nreads.length===1,'image: placeholder first, file read once');
 await new Promise(x=>setTimeout(x,20));
 ih=t('(r)=>uiW(r.ui,"1:0","live")')(r);ok(/<img src="data:image\/png;base64,AAAA"/.test(ih)&&/max-height:600px/.test(ih)&&nreads.length===1,'image: after load shows the picture (cached, no second read)');
 ok(ih.indexOf('&lt;script&gt;')>0&&!/<script/i.test(ih),'image: caption and alt escaped');
 t("UI_IMG.clear()");b64reply={b64:'AAAA',mime:'text/html'};
 t('(r)=>uiW(r.ui,"1:0","live")')(r);await new Promise(x=>setTimeout(x,20));
 ok(/Image nahi mili/.test(t('(r)=>uiW(r.ui,"1:0","live")')(r)),'image: wrong mime (html) refused');
 t("UI_IMG.clear()");b64reply=null;t('(r)=>uiW(r.ui,"1:0","live")')(r);await new Promise(x=>setTimeout(x,20));
 ok(/Image nahi mili/.test(t('(r)=>uiW(r.ui,"1:0","live")')(r)),'image: missing file shows a message, no crash');
 t("UI_IMG.clear()");b64reply={b64:'A'.repeat(4000001),mime:'image/png'};t('(r)=>uiW(r.ui,"1:0","live")')(r);await new Promise(x=>setTimeout(x,20));
 ok(/Image nahi mili/.test(t('(r)=>uiW(r.ui,"1:0","live")')(r)),'image: file over ~3 MB refused');
 b64reply={b64:'AAAA',mime:'image/png'};
 // ---- 7c. expired (message from an older app run)
 setH([{role:'user',content:'q'},W('a')],true);
 ok(st('1:0')==='expired','widget not made in this run = expired');
 t('render()');ok(/data-live="0"/.test(els['#chat'].innerHTML)&&/uiexp/.test(els['#chat'].innerHTML)&&/dobara khuli/.test(els['#chat'].innerHTML),'expired widget: static, with a hint');
 setH([{role:'user',content:'q'},{role:'assistant',content:'a\n```ui\n'+F+'\n```'}],true);
 ok(st('1:0')==='expired','fenced widget from an older run is expired too');
 t('render()');ok(/uiexp/.test(els['#chat'].innerHTML),'fenced expired widget shows the hint');
 setH([{role:'user',content:'q'},{role:'assistant',local:1,content:'',aiNote:'w',ui:JSON.parse(JSON.stringify(Q))}],true);t('render()');script=['x'];n=0;const le=getH().length;
 await tap(fakeW('1:0',false),'opt',2,1);ok(getH().length===le,'expired widget: tap does nothing');
 setH([{role:'user',content:'q'},W('a',true)],true);ok(st('1:0')==='expired','keep:true does not save an expired widget');
 // a restored chat plus a new widget: old expired, new live
 {const HH=t('H');HH.length=0;[{role:'user',content:'q'},W('a'),{role:'user',content:'B'}].forEach(m=>HH.push(m));}
 script=[[tc('c1','ui_render',{v:1,id:'n',blocks:[{type:'text',md:'naya'}]})],''];n=0;els['#in'].value='aur';await handlers['#f:submit']({preventDefault(){}});
 ok(st('1:0')==='expired'&&st('4:0')==='live'||st('1:0')==='expired'&&Object.values(t('UI_INFO')).includes('live'),'after restore: old widget expired, newly made widget live');
 // ---- 7d. Rich UI switch
 t("S.ui={off:true}");
 ok(!t('uiTools()').some(x=>x.function.name==='ui_render')&&t('uiTools()').length===t('TOOLS').length-1,'switch off: ui_render is not offered to the AI');
 ok(!t("ruleAreas('ek quiz lo')").includes('ui'),'switch off: ui rules are not added');
 setH([{role:'user',content:'q'},W('a')]);t('render()');ok(/invalid|off hai/i.test(els['#chat'].innerHTML)&&!/class="uiw/.test(els['#chat'].innerHTML),'switch off: a stored widget shows as code with a note');
 script=['plain jawab'];n=0;bodies.length=0;els['#in'].value='quiz lo';await handlers['#f:submit']({preventDefault(){}});
 ok(!bodies[0].tools.some(x=>x.function.name==='ui_render'),'switch off: the request to the provider has no ui_render tool');
 t("S.ui={}");ok(t('uiTools()').some(x=>x.function.name==='ui_render'),'switch on again: ui_render is back');
 {let html='';try{t('sheet()');html=Object.values(els).map(e=>e.innerHTML||'').join('')}catch(e){html='ERR '+e.message}
  ok(/id="ui_on"/.test(html)&&/Rich UI in chat/.test(html),'Settings has the "Rich UI in chat" switch ('+(html.slice(0,3)==='ERR'?html:'ok')+')');}
 // ---- 7e. P3: html game widget
 const HP=src=>{const r=V({v:1,blocks:[{type:'html',src},{type:'text',md:'t'}]});return r.ok&&r.ui.blocks[0].type==='html'?r.ui.blocks[0]:null};
 ok(HP('/sdcard/Chaman/ui/snake.html')&&HP('/sdcard/Chaman/ui/snake.html').src==='/sdcard/Chaman/ui/snake.html','html: game file in ui/ accepted');
 ok(HP('ui/snake.HTML')&&HP('ui/games/a.html'),'html: relative path and sub-folder of ui/ ok');
 ok(!HP('/sdcard/Chaman/work/snake.html')&&!HP('/sdcard/Chaman/snake.html')&&!HP('/sdcard/Chaman/notes/x.html'),'html: other folders (work, root, notes) rejected');
 ok(!HP('/sdcard/Chaman/ui/x.txt')&&!HP('/sdcard/Chaman/ui/x.js')&&!HP('/sdcard/Chaman/ui/x.htm'),'html: only .html');
 ok(!HP('/sdcard/Chaman/ui/../notes/x.html')&&!HP('ui/../../x.html')&&!HP('/etc/ui/x.html')&&!HP('/sdcard/DCIM/ui/x.html'),'html: .. and outside the workspace rejected');
 ok(!HP('https://evil.com/ui/x.html')&&!HP('file:///sdcard/Chaman/ui/x.html')&&!HP('javascript:alert(1)')&&!HP('data:text/html,<script>1</script>')&&!HP(''),'html: urls / schemes / empty rejected');
 r=V({v:1,blocks:[{type:'html',html:'<script>alert(1)</script>',height:300},{type:'text',md:'t'}]});
 ok(r.ok&&r.ui.blocks.length===2&&r.ui.blocks[0].type==='html'&&/^inline:/.test(r.ui.blocks[0].src)&&r.ui.blocks[0].html==='<script>alert(1)</script>','html: inline html accepted (P4), runs in the same sandbox panel');
 ok(!V({v:1,blocks:[{type:'html',html:'x'.repeat(30001)}]}).ok&&V({v:1,blocks:[{type:'html',html:'x'.repeat(30000)}]}).ok,'html: inline limit 30000 chars');
 ok(!V({v:1,blocks:[{type:'html',html:'   '}]}).ok,'html: blank inline html is invalid');
 r=V({v:1,blocks:[{type:'html',src:'ui/a.html',height:9999},{type:'html',src:'ui/b.html',height:5,label:'<b>',title:XSS}]});
 ok(r.ui.blocks[0].height===700&&r.ui.blocks[1].height===120&&r.ui.blocks[0].label==='Play','html: height 120..700, default label Play');
 ch=t('(r)=>uiW(r.ui,"1:0","live")')(r);ok(/data-ua="play"/.test(ch)&&!/<iframe/i.test(ch)&&!/<script|<img/i.test(ch)&&ch.indexOf('&lt;script&gt;')>0,'html card in chat: Play button only, no iframe, texts escaped');
 ok(/game snake/.test(t('uiNote')({id:'g',blocks:[{type:'html',src:'/sdcard/Chaman/ui/snake.html'}]})),'AI history note names the game');
 ok(t("uiGName('/sdcard/Chaman/ui/My Snake!.html')")==='MySnake'&&t("uiGName('/x/ui/'+'a'.repeat(60)+'.html')").length===24,'game name for the [game:..] prefix is cleaned (letters digits _ -, max 24)');
 // game document
 const GD=t('uiGameDoc')('<!-- <head> --><head><meta http-equiv="Content-Security-Policy" content="default-src *"><base href="https://evil/"></head><body><script>var GAME=1</script></body>','dark');
 const iCsp=GD.indexOf("default-src 'none'"),iGame=GD.indexOf('var GAME=1'),iFake=GD.indexOf('<!-- <head>');
 ok(/^<!doctype html>/i.test(GD)&&iCsp>0&&iCsp<iFake&&iCsp<iGame,'game doc: our CSP comes before anything from the game file (a fake <head>, comment or meta cannot come first)');
 ok(/connect-src 'none'/.test(GD)&&/base-uri 'none'/.test(GD)&&/form-action 'none'/.test(GD)&&/frame-src 'none'/.test(GD)&&!/default-src \*/.test(GD.slice(0,iGame-50))||GD.indexOf("default-src 'none'")<GD.indexOf('default-src *'),'game doc: CSP has no network, no base, no forms, no frames');
 ok((GD.match(/window\.chaman=/g)||[]).length===1&&/data-theme="dark"/.test(GD)&&/theme:"dark"/.test(GD),'game doc: bridge defined once, theme passed');
 ok(/<html data-theme="light"/.test(t('uiGameDoc')('x'))&&/<\/script><\/head><body>x<\/body><\/html>$/.test(t('uiGameDoc')('x')),'game doc: plain content is wrapped, default theme light');
 // bridge
 const WIN={},SENT=[];
 t("UIG.fr=null");const setG=()=>{t('UIG').fr={contentWindow:WIN};t('UIG').name='snake';t('UIG').n=0;t('UIG').last=0;t('UIG').pend='';SENT.length=0};
 ctx.ORIGSEND=t('uiSendText');t("uiSendText=(m,c)=>{GSENT.push([m,c]);return !GBUSY}");ctx.GSENT=SENT;ctx.GBUSY=false;
 const B2=(src,d)=>t('uiBridge')({source:src,data:d});
 setG();B2(WIN,{__chaman:1,t:'score 5'});ok(SENT.length===1&&SENT[0][0]==='[game:snake] score 5'&&SENT[0][1]==='score 5','bridge: event becomes "[game:snake] score 5" with a chip');
 t('UIG').last=0;B2({},{__chaman:1,t:'x'});B2(null,{__chaman:1,t:'x'});B2(WIN,{t:'no flag'});B2(WIN,{__chaman:1,t:5});B2(WIN,{__chaman:1,t:'   '});B2(WIN,null);B2(WIN,'string');
 ok(SENT.length===1,'bridge: other windows, missing flag, non-string, empty, junk are ignored');
 t('UIG.last=Date.now()');B2(WIN,{__chaman:1,t:'too fast'});ok(SENT.length===1,'bridge: a second event within 1.5 s is dropped');
 t('UIG.last=0');B2(WIN,{__chaman:1,t:'a\nb\u0000c'+'x'.repeat(300)});ok(SENT.length===2&&SENT[1][0].length<='[game:snake] '.length+200&&!/[\n\u0000]/.test(SENT[1][0])&&SENT[1][1].length<=40,'bridge: control characters removed, 200 char cap, chip max 40');
 for(let i=0;i<30;i++){t('UIG.last=0');B2(WIN,{__chaman:1,t:'e'+i})}
 ok(SENT.length===20,'bridge: at most 20 events per run ('+SENT.length+')');
 setG();t('UIG').last=0;ctx.GBUSY=true;B2(WIN,{__chaman:1,t:'late event'});
 ok(SENT.length===1&&t('UIG').pend==='late event','bridge: AI busy = event kept (newest)');
 ctx.GBUSY=false;await new Promise(x=>setTimeout(x,1700));ok(SENT.length===2&&SENT[1][0]==='[game:snake] late event'&&t('UIG').pend==='','bridge: the kept event is sent once the AI is free');
 setG();t("UIG.fr=null");B2(WIN,{__chaman:1,t:'x'});ok(SENT.length===0,'bridge: no game open = ignored');
 setG();t("S.ui={off:true}");B2(WIN,{__chaman:1,t:'x'});ok(SENT.length===0,'bridge: Rich UI off = ignored');t("S.ui={}");
 t('uiSendText=ORIGSEND');
 // panel closes when its widget is gone / switch off
 t("UIG.fr={remove(){}};UIG.src='/sdcard/Chaman/ui/snake.html'");
 setH([{role:'user',content:'q'},{role:'assistant',local:1,content:'',aiNote:'w',ui:{v:1,id:'g',blocks:[{type:'html',src:'/sdcard/Chaman/ui/snake.html'}]}}]);
 ok(t('UIG.src')==='/sdcard/Chaman/ui/snake.html','panel stays open while its widget is in the chat');
 setH([{role:'user',content:'q'}]);ok(t('UIG.src')===''&&t('UIG.fr')===null,'panel closes when its widget is gone (new chat)');
 t("UIG.fr={remove(){}};UIG.src='/sdcard/Chaman/ui/snake.html'");t("S.ui={off:true}");
 setH([{role:'user',content:'q'},{role:'assistant',local:1,content:'',aiNote:'w',ui:{v:1,id:'g',blocks:[{type:'html',src:'/sdcard/Chaman/ui/snake.html'}]}}]);
 ok(t('UIG.src')==='','panel closes when Rich UI is switched off');t("S.ui={}");
 // rules
 ok(t("ruleAreas('chat me snake game banao')").includes('game')&&t("ruleAreas('ek tic tac toe khelte hain')").includes('game')&&!t("ruleAreas('torch on kar')").includes('game'),'rules: area "game" is added for game requests only');
 setH([{role:'user',content:'chat me ek quiz game banao'}]);const RB=t('rulesBlock()');ok(/CHAT GAMES/.test(RB)&&/WIDGETS/.test(RB),'rules: quiz + game request gets both areas');
 ok(/\/sdcard\/Chaman\/ui\//.test(t('RULES.game'))&&/chaman\.send/.test(t('RULES.game'))&&/not from Najeef/.test(t('RULES.game'))&&/never delete, send, pay/.test(t('RULES.game')),'rules: game area explains the folder, the bridge and that [game:] text is not Najeef');
 ok(t("TOOLS.find(x=>x.function.name==='rules_read').function.parameters.properties.area.enum").includes('game')&&/rules_read game/.test(t("TOOLS.find(x=>x.function.name==='ui_render').function.description")),'rules_read enum has game; ui_render points to it');
 ok(/games in a panel/.test(t('skillText()')),'skill text mentions games');
 ok(/rules_read game/.test(t('RULES.ui'))&&!/html \(games\) and diagram do not exist/.test(t('RULES.ui')),'ui rules point to the game area');

 // ---- 7f. P4: mermaid subset
 const MM=c=>t('uiMermaid')(c);
 let m=MM('graph TD\n A[Start] --> B{Valid?}\n B -->|yes| C[Home]\n B -->|no| D((Error))');
 ok(!m.err&&m.dir==='TB'&&m.nodes.length===4&&m.edges.length===3,'mermaid: basic flowchart (4 nodes, 3 edges)');
 ok(m.nodes[0].shape==='box'&&m.nodes[1].shape==='diamond'&&m.nodes[3].shape==='circle'&&m.nodes[1].label==='Valid?','mermaid: shapes [] {} (()) and labels');
 ok(m.edges[1].label==='yes'&&m.edges[2].label==='no'&&m.edges[0].arrow===true,'mermaid: |label| on edges');
 m=MM('flowchart LR\nA-->B-->C');ok(m.dir==='LR'&&m.edges.length===2&&m.edges[1].from==='B'&&m.edges[1].to==='C','mermaid: LR and chains without spaces');
 m=MM('graph RL\nA-->B');ok(m.dir==='LR','mermaid: RL is treated as LR');
 m=MM('graph TD\nA -- text here --> B\nB -.-> C\nC ==> D\nD --- E\nE -. dotted .-> F\nF == big == > G'.replace(' > G','>G'));
 ok(!m.err&&m.edges[0].label==='text here'&&m.edges[0].style==='solid'&&m.edges[1].style==='dashed'&&m.edges[2].style==='thick'&&m.edges[3].arrow===false&&m.edges[4].style==='dashed'&&m.edges[4].label==='dotted'&&m.edges[5].style==='thick','mermaid: -- text -->, -.->, ==>, ---, -. text .->, == text ==>');
 m=MM('graph TD\nA & B --> C & D');ok(m.edges.length===4,'mermaid: A & B --> C & D = 4 edges');
 m=MM('graph TD; A-->B; B-->C %% not a comment mid-line'.replace(' %% not a comment mid-line',''));ok(!m.err&&m.edges.length===2,'mermaid: ; separators');
 m=MM('%% hello\ngraph TD\nsubgraph S\nA-->B\nend\nstyle A fill:#f00\nclassDef x fill:#fff\nclass A x\nlinkStyle 0 stroke:red\nclick A cb\nB-->C');
 ok(!m.err&&m.nodes.length===3&&m.edges.length===2,'mermaid: comments, subgraph/end, style, classDef, class, linkStyle, click are ignored');
 m=MM('graph TD\nA["Hello (world)"] --> B[Two<br/>lines]');ok(!m.err&&m.nodes[0].label==='Hello (world)'.replace('(world)','(world)')&&m.nodes[1].label==='Two lines','mermaid: quoted labels, <br/>');
 m=MM('graph TD\nA-->B\nA[Late label]');ok(m.nodes[0].label==='Late label'&&m.nodes.length===2,'mermaid: a later definition gives the label');
 m=MM('graph TD\nA([Pill]) --> B[[Sub]] --> C(Round)');ok(m.nodes[0].shape==='round'&&m.nodes[1].shape==='box'&&m.nodes[2].shape==='round','mermaid: ([ ]) [[ ]] ( ) shapes');
 for(const bad of ['sequenceDiagram\nA->>B: hi','gantt\ntitle x','classDiagram\nclass A','stateDiagram-v2\n[*] --> A','pie\n"a":1','graph TD\nA ->> B','graph TD\nA --> ','graph TD\n???','','graph TD\n%% only comment'])ok(!!MM(bad).err,'mermaid: unsupported is an error, never guessed: '+JSON.stringify(bad).slice(0,32));
 ok(/sequenceDiagram/.test(MM('sequenceDiagram\nA->>B: hi').err),'mermaid: error names the unsupported type');
 // ---- diagram validator
 const DG=(o)=>V({v:1,blocks:[Object.assign({type:'diagram'},o)]});
 r=DG({nodes:[{id:'a',label:'Start',shape:'start'},{id:'b',label:'Ok?',shape:'decision'},{id:'c',shape:'ellipse'},{id:'d',shape:'weird'}],edges:[{from:'a',to:'b'},{from:'b',to:'c',label:'yes',style:'dashed'},{from:'b',to:'zz'}]});
 ok(r.ok&&r.ui.blocks[0].nodes.map(n=>n.shape).join()==='round,diamond,circle,box,box'&&r.ui.blocks[0].nodes[4].id==='zz'&&r.ui.blocks[0].nodes[4].label==='zz','diagram: shape aliases, unknown shape = box, an edge target that is not listed is created');
 ok(r.ui.blocks[0].edges[1].style==='dashed'&&r.ui.blocks[0].edges[0].style==='solid'&&r.ui.blocks[0].edges[0].arrow===true,'diagram: edge style and arrow');
 r=DG({format:'flow',nodes:[{id:'a'}],edges:[]});ok(r.ok,'diagram: format "flow" = nodes');
 r=DG({format:'mermaid',code:'graph LR\nA-->B'});ok(r.ok&&r.ui.blocks[0].dir==='LR'&&r.ui.blocks[0].nodes.length===2,'diagram: mermaid code converted');
 r=DG({code:'graph TD\nX-->Y'});ok(r.ok&&r.ui.blocks[0].nodes.length===2,'diagram: code without format is mermaid');
 r=DG({format:'mermaid',code:'sequenceDiagram\nA->>B: x'});ok(!r.ok&&/mermaid/.test(r.err)&&/sequenceDiagram/.test(r.err),'diagram: bad mermaid = the widget is rejected with a clear error');
 ok(!DG({nodes:Array.from({length:41},(_,i)=>({id:'n'+i}))}).ok&&DG({nodes:Array.from({length:40},(_,i)=>({id:'n'+i}))}).ok,'diagram: 40 nodes max');
 ok(!DG({nodes:[{id:'a'}],edges:Array.from({length:81},()=>({from:'a',to:'a'}))}).ok,'diagram: 80 edges max');
 ok(!DG({nodes:[{id:'a',label:'x'.repeat(81)}]}).ok&&DG({nodes:[{id:'a',label:'x'.repeat(80)}]}).ok,'diagram: label 80 chars max');
 ok(!DG({nodes:[],edges:[]}).ok&&!DG({}).ok,'diagram: empty = dropped');
 r=DG({nodes:[{id:'a b'},{id:'ok'},{id:'ok',label:'dup'},{label:'noid'}],edges:[{from:'ok',to:'ok'},{from:'',to:'ok'},{from:'ok'}]});
 ok(r.ok&&r.ui.blocks[0].nodes.length===1&&r.ui.blocks[0].edges.length===1,'diagram: bad ids, duplicates and half edges are skipped');
 // ---- layout
 const LAY=(d)=>t('uiDgLayout')(Object.assign({dir:'TB'},d));
 const dgOf=(nodes,edges,dir)=>t('(a)=>a')({nodes:nodes.map(n=>typeof n==='string'?{id:n,label:n,shape:'box'}:n),edges:edges.map(e=>Object.assign({label:'',style:'solid',arrow:true},e)),dir:dir||'TB'});
 const okLay=(L)=>{const fin=v=>Number.isFinite(v);let good=L.nodes.every(n=>fin(n.x)&&fin(n.y)&&n.w>0&&n.h>0)&&L.edges.every(e=>e&&!/NaN|undefined|Infinity/.test(e.d));
   for(const n of L.nodes){if(n.x-n.w/2<-0.5||n.y-n.h/2<-0.5||n.x+n.w/2>L.vb.w+0.5||n.y+n.h/2>L.vb.h+0.5)good=false}
   for(let i=0;i<L.nodes.length;i++)for(let j=i+1;j<L.nodes.length;j++){const a=L.nodes[i],b=L.nodes[j];if(Math.abs(a.x-b.x)<(a.w+b.w)/2-0.5&&Math.abs(a.y-b.y)<(a.h+b.h)/2-0.5)good=false}
   return good};
 let L1=LAY(dgOf(['a','b','c','d'],[{from:'a',to:'b'},{from:'a',to:'c'},{from:'b',to:'d'},{from:'c',to:'d'}]));
 ok(okLay(L1),'layout: diamond-shaped graph, no overlap, everything inside the view box, no NaN');
 const ny=id=>L1.nodes.find(n=>n.id===id).y,nx=id=>L1.nodes.find(n=>n.id===id).x;
 ok(ny('a')<ny('b')&&ny('b')===ny('c')&&ny('b')<ny('d')&&Math.abs(nx('a')-(nx('b')+nx('c'))/2)<2,'layout: TB layers go downwards, siblings share a row, parent is centred over its children');
 L1=LAY(dgOf(['a','b','c'],[{from:'a',to:'b'},{from:'b',to:'c'},{from:'c',to:'a'}]));ok(okLay(L1),'layout: a cycle (a>b>c>a) works');
 const yy=id=>L1.nodes.find(n=>n.id===id).y;ok(yy('a')<yy('b')&&yy('b')<yy('c'),'layout: the cycle is broken at its back edge (a above b above c)');
 L1=LAY(dgOf(['a','b'],[{from:'a',to:'a'},{from:'a',to:'b'},{from:'b',to:'a'}]));ok(okLay(L1)&&L1.edges.length===3,'layout: self loop + 2-cycle');
 L1=LAY(dgOf(['a','b','c','d','e'],[{from:'a',to:'b'},{from:'b',to:'c'},{from:'c',to:'d'},{from:'a',to:'d'},{from:'d',to:'e'}]));
 ok(okLay(L1),'layout: long edge (a>d skips layers) with dummy vertices, no overlap');
 L1=LAY(dgOf(['a','b','c','d'],[{from:'a',to:'b'},{from:'c',to:'d'}]));ok(okLay(L1),'layout: two disconnected parts');
 L1=LAY(dgOf(['x'],[]));ok(okLay(L1)&&L1.vb.w>0&&L1.vb.h>0,'layout: a single node');
 L1=LAY(dgOf(['a','b','c'],[{from:'a',to:'b'},{from:'b',to:'c'}],'LR'));
 ok(okLay(L1)&&L1.nodes[0].x<L1.nodes[1].x&&L1.nodes[1].x<L1.nodes[2].x&&Math.abs(L1.nodes[0].y-L1.nodes[2].y)<2&&L1.vb.w>L1.vb.h,'layout: LR goes left to right, wide view box');
 const big=Array.from({length:40},(_,i)=>'n'+i),bigE=[];for(let i=1;i<40;i++){bigE.push({from:'n'+Math.floor((i-1)/2),to:'n'+i});if(i%5===0)bigE.push({from:'n'+i,to:'n'+Math.floor(i/3)})}
 const t0=Date.now();L1=LAY(dgOf(big,bigE));ok(okLay(L1)&&Date.now()-t0<400,'layout: 40 nodes + back edges: valid and fast ('+(Date.now()-t0)+' ms)');
 L1=LAY(dgOf([{id:'a',label:'A very long label that must wrap onto several lines and then get cut',shape:'box'},{id:'b',label:'Short',shape:'diamond'},{id:'c',label:'Circle',shape:'circle'}],[{from:'a',to:'b',label:'yes'},{from:'b',to:'c',label:'no'}]));
 ok(okLay(L1)&&L1.nodes[0].lines.length<=3&&L1.nodes[0].lines.every(l=>l.length<=16),'layout: long labels wrapped (max 3 lines of 16)');
 // ---- diagram HTML
 r=V({v:1,id:'dg',blocks:[{type:'diagram',title:XSS,nodes:[{id:'a',label:XSS,shape:'diamond'},{id:'b',label:'B',shape:'circle'},{id:'c',label:'C',shape:'round'},{id:'d',label:'D'}],edges:[{from:'a',to:'b',label:XSS.slice(0,40)},{from:'b',to:'c',style:'dashed'},{from:'c',to:'d',style:'thick',arrow:false}]}]});
 ch=t('(r)=>uiW(r.ui,"1:0","live")')(r);
 ok(r.ok&&/<svg class="uds"/.test(ch)&&(ch.match(/<path class="ude/g)||[]).length===3&&/<polygon/.test(ch)&&/<ellipse/.test(ch)&&/<rect class="udn"/.test(ch)&&/marker-end/.test(ch)&&(ch.match(/marker-end/g)||[]).length===2,'diagram HTML: svg, 3 edges (2 with arrows), diamond/circle/box shapes');
 ok(!/NaN|undefined|Infinity/.test(ch)&&!/<script|<img/i.test(ch)&&ch.indexOf('&lt;script&gt;')>0,'diagram HTML: numbers clean, labels escaped');
 {const TG=new Set('div span b small button svg defs marker path rect polygon ellipse text tspan hr pre code i'.split(' ')),AT=new Set('class data-ui data-live data-ua data-b data-i data-base type disabled aria-label viewBox preserveAspectRatio role id refX refY markerWidth markerHeight orient marker-end d points x y width height rx ry cx cy text-anchor'.split(' '));let bt='',ba='';
  for(const mm of ch.matchAll(/<\/?([a-zA-Z0-9]+)((?:\s+[a-zA-Z-]+(?:="[^"<>]*")?)*)\s*\/?>/g)){if(!TG.has(mm[1]))bt=mm[1];for(const a of mm[2].matchAll(/\s+([a-zA-Z-]+)(?:="([^"]*)")?/g))if(!AT.has(a[1]))ba=a[1]}
  ok(!bt&&!ba,'diagram HTML: only whitelisted tags and attributes (bad: '+bt+' '+ba+')');}
 ok(/data-base="[\d. ]+"/.test(ch)&&(ch.match(/data-ua="dz"/g)||[]).length===3&&/aria-label="Zoom in"/.test(ch),'diagram HTML: base view box + 3 zoom buttons (+, -, Fit)');
 // pan / zoom maths
 const BASE={x:0,y:0,w:400,h:300};
 let vz=t('uiDgView')(BASE,BASE,'in');ok(Math.abs(vz.w-320)<1e-6&&Math.abs(vz.h-240)<1e-6&&Math.abs(vz.x+vz.w/2-200)<1e-6&&Math.abs(vz.y+vz.h/2-150)<1e-6,'zoom in: 80% window around the centre');
 vz=t('uiDgView')(BASE,BASE,'out');ok(Math.abs(vz.w-500)<1e-6&&Math.abs(vz.x+vz.w/2-200)<1e-6,'zoom out: 125%');
 ok(JSON.stringify(t('uiDgView')({x:50,y:40,w:100,h:75},BASE,'reset'))===JSON.stringify(BASE),'reset = the base view');
 let vv=BASE;for(let i=0;i<40;i++)vv=t('uiDgView')(vv,BASE,'in');ok(Math.abs(vv.w-60)<1e-6,'zoom in stops at 15% of the base');
 vv=BASE;for(let i=0;i<40;i++)vv=t('uiDgView')(vv,BASE,'out');ok(Math.abs(vv.w-1600)<1e-6,'zoom out stops at 4x the base');
 vz=t('uiDgView')(BASE,BASE,0.5,100,60);ok(Math.abs(vz.w-200)<1e-6&&Math.abs((100-vz.x)/vz.w-0.25)<1e-6&&Math.abs((60-vz.y)/vz.h-0.2)<1e-6,'pinch zoom keeps the focal point under the fingers');
 // ---- badge + stat
 r=V({v:1,blocks:[{type:'badge',items:[{label:'Naya',color:'red'},{label:'Ok',color:'GREEN'},{label:'Info',color:'blue'},{label:'Gray',color:'gray'},{label:'Cyan',color:'cyan'},{label:'Unknown',color:'pink'},{label:'Plain'},'Shorthand',{label:''}]}]});
 ok(r.ok&&r.ui.blocks[0].items.map(i=>i.color).join()==='red,green,blue,grey,teal,grey,grey,grey'&&r.ui.blocks[0].items.length===8,'badge: colors normalised (GREEN, gray, cyan>teal, unknown>grey), string items ok, empty label dropped');
 r=V({v:1,blocks:[{type:'badge',label:'Solo',color:'orange'}]});ok(r.ok&&r.ui.blocks[0].items[0].label==='Solo'&&r.ui.blocks[0].items[0].color==='orange','badge: single label at top level');
 ok(!V({v:1,blocks:[{type:'badge',items:[]}]}).ok&&V({v:1,blocks:[{type:'badge',items:Array.from({length:30},(_,i)=>'b'+i)}]}).ui.blocks[0].items.length===24,'badge: empty dropped, 24 max');
 r=V({v:1,id:'bd',blocks:[{type:'badge',items:[{label:'Red',color:'red'},{label:'Tap me',color:'green',action:{type:'send',value:'tapped <b>',silent:true}},{label:'Copy me',color:'blue',action:{type:'copy',value:'abc'}},{label:XSS.slice(0,38),color:'purple',action:{type:'open',value:'x'}}]}]});
 ch=t('(r)=>uiW(r.ui,"1:0","live")')(r);
 ok((ch.match(/<span class="uibg /g)||[]).length===2&&(ch.match(/<button type="button" class="uibg tap /g)||[]).length===2&&/uibg red/.test(ch)&&/uibg tap green/.test(ch)&&/uibg purple/.test(ch),'badge HTML: plain = span, with action = tappable button, per-colour classes');
 ok(ch.indexOf('&lt;script&gt;')>0&&!/<script|<img/i.test(ch),'badge HTML: escaped');
 ch=t('(r)=>uiW(r.ui,"1:0","frozen")')(r);ok((ch.match(/uibg tap [a-z]+" data-ua="bdg" data-b="1" data-i="\d"( disabled)?/g)||[]).filter(x=>/disabled/.test(x)).length===1,'badge HTML: frozen widget disables send badges, copy badge stays');
 setH([{role:'user',content:'x'},{role:'assistant',local:1,content:'',aiNote:'w',ui:{v:1,id:'bd',blocks:[{type:'badge',items:[{label:'Haan',color:'green',action:{type:'send',value:'haan, chalo'}},{label:'Copy',color:'blue',action:{type:'copy',value:'abc 1'}},{label:'Static',color:'red'}]}]}}]);t('render()');script=['ok'];n=0;
 await tap(fakeW('1:0',true),'bdg',1,0);ok(lastUser().content==='haan, chalo'&&!lastUser().chip,'badge tap: suggestion chip sends its value');
 setH([{role:'user',content:'x'},{role:'assistant',local:1,content:'',aiNote:'w',ui:{v:1,id:'bd',blocks:[{type:'badge',items:[{label:'Haan',color:'green',action:{type:'send',value:'haan, chalo'}},{label:'Copy',color:'blue',action:{type:'copy',value:'abc 1'}}]}]}}]);
 const lb=getH().length;copied=null;await tap(fakeW('1:0',false),'bdg',1,0);ok(getH().length===lb,'badge tap on a frozen widget: nothing sent');
 await tap(fakeW('1:0',false),'bdg',1,1);await new Promise(x=>setTimeout(x,10));ok(copied==='abc 1','badge copy works on a frozen widget');
 r=V({v:1,blocks:[{type:'stat',items:[{k:'Status',v:'Live',type:'status',color:'green'},{k:'Tag',v:'New',type:'badge',color:'red'},{k:'Disk',v:'70',type:'progress',max:100},{k:'Ring',v:'3',type:'ring',max:10},{k:'Users',v:1200,type:'number'},{k:'Plain',v:'x'},{k:'Bad',v:'y',type:'weird'}]}]});
 ok(r.ok&&r.ui.blocks[0].items.map(i=>i.type).join()==='status,badge,progress,progress,number,text,text','stat: types (ring = progress, unknown = text)');
 ch=t('(r)=>uiW(r.ui,"1:0","live")')(r);ok(/uidot green/.test(ch)&&/uibg red/.test(ch)&&(ch.match(/class="uipb sm"/g)||[]).length===2&&/width:70\.0%/.test(ch)&&/width:30\.0%/.test(ch)&&/1200/.test(ch),'stat HTML: status dot, badge, 2 progress bars (70%, 30%), number');
 ch=t('(r)=>uiW(r.ui,"1:0","live")')(V({v:1,blocks:[{type:'stat',state:'empty'}]}));ok(/uiemp/.test(ch)&&/Kuch nahi/.test(ch),'stat: empty state');
 ch=t('(r)=>uiW(r.ui,"1:0","live")')(V({v:1,blocks:[{type:'stat',state:'skeleton',items:[{k:'a',v:'b'},{k:'c',v:'d'}]}]}));ok((ch.match(/class="uisk"/g)||[]).length===2,'stat: skeleton state');
 ch=t('(r)=>uiW(r.ui,"1:0","live")')(V({v:1,blocks:[{type:'stat',items:[{k:XSS,v:XSS,type:'badge',color:'red'},{k:XSS,v:XSS,type:'status'},{k:XSS,v:'<b>',type:'progress'}]}]}));ok(!/<script|<img|<b>/i.test(ch)&&ch.indexOf('&lt;script&gt;')>0&&!/NaN/.test(ch),'stat: escaped, bad progress value is 0');
 ok(!V({v:1,blocks:[{type:'stat',items:[]}]}).ok,'stat: no items and no state is dropped');
 // ---- rev-2 names as aliases
 r=V({v:1,blocks:[{type:'button',items:[{label:'A',variant:'primary',action:{type:'send',value:'a'}},{label:'B',variant:'danger'},{label:'C',variant:'ghost'},{label:'D',variant:'fab'},{label:'E',style:'primary'}]}]});
 ok(r.ok&&r.ui.blocks[0].type==='buttons'&&r.ui.blocks[0].items.map(i=>i.style).join()==='primary,danger,secondary,secondary,primary','alias: button {variant} = buttons {style}');
 r=V({v:1,blocks:[{type:'media',kind:'image',src:'work/a.png'},{type:'media',src:'gen:x1'},{type:'media',kind:'gallery',src:'work/a.png'},{type:'media',kind:'video',src:'work/a.mp4'},{type:'text',md:'t'}]});
 ok(r.ok&&r.ui.blocks.filter(b=>b.type==='image').length===2&&r.ui.skipped===2,'alias: media {kind:image} = image; other media kinds are skipped (later phase)');
 r=V({v:1,blocks:[{type:'canvas',kind:'game',src:'ui/snake.html',height:300},{type:'canvas',src:'ui/x.html'},{type:'canvas',kind:'board',rows:['X.O']},{type:'canvas',kind:'scene3d',src:'ui/x.html'},{type:'canvas',kind:'draw'},{type:'canvas',kind:'game',html:'<b>hi</b>'}]});
 ok(r.ok&&r.ui.blocks.map(b=>b.type).join()==='html,html,board,html'&&r.ui.skipped===2&&r.ui.blocks[3].html==='<b>hi</b>','alias: canvas game > html (file or inline), canvas board > board, other kinds skipped');
 // ---- inline html identity / panel
 const i1=V({v:1,blocks:[{type:'html',html:'<b>one</b>',title:'Demo A'}]}).ui.blocks[0],i2=V({v:1,blocks:[{type:'html',html:'<b>one</b>'}]}).ui.blocks[0],i3=V({v:1,blocks:[{type:'html',html:'<b>two</b>'}]}).ui.blocks[0];
 ok(i1.src===i2.src&&i1.src!==i3.src,'inline html: same html = same identity, different html = different');
 ok(V({v:1,blocks:[{type:'html',src:'ui/real.html',html:'<b>x</b>'}]}).ui.blocks[0].src==='/sdcard/Chaman/ui/real.html'&&V({v:1,blocks:[{type:'html',src:'ui/real.html',html:'<b>x</b>'}]}).ui.blocks[0].html==='','inline html: a valid src file wins over html');
 ok(V({v:1,blocks:[{type:'html',src:'/etc/x.html',html:'<b>x</b>'}]}).ui.blocks[0].html==='<b>x</b>','inline html: an invalid src falls back to the inline html');
 ch=t('(r)=>uiW(r.ui,"1:0","live")')(V({v:1,blocks:[{type:'html',html:'<script>1</script>'}]}));ok(/inline html/.test(ch)&&/Demo/.test(ch)&&!/<script/i.test(ch)&&!/<iframe/i.test(ch),'inline html card: title Demo, "inline html", code never in the chat');
 ok(/game inline/.test(t('uiNote')({id:'g',blocks:[{type:'html',src:'inline:ab',html:'x'}]})),'AI history note says inline game');
 t("UIG.fr={remove(){}};UIG.src='"+i1.src+"'");
 setH([{role:'user',content:'q'},{role:'assistant',local:1,content:'',aiNote:'w',ui:{v:1,id:'g',blocks:[{type:'html',html:'<b>one</b>',title:'Demo A'}]}}]);
 ok(t('UIG.src')===i1.src,'panel stays open while its inline widget is in the chat');
 setH([{role:'user',content:'q'}]);ok(t('UIG.src')==='','panel closes when the inline widget is gone');
 // ---- {json} placeholder
 const CJ={v:1,id:'cj',blocks:[{type:'choice',mode:'multi',options:[{label:'Chai',value:'tea'},{label:'Doodh',value:'milk'},'Pani'],submit:{label:'OK',action:{type:'send',value:'pick {json}'}}}]};
 t('for(const k in UI_ST)delete UI_ST[k]');
 setH([{role:'user',content:'x'},{role:'assistant',local:1,content:'',aiNote:'w',ui:CJ}]);t('render()');script=['ok'];n=0;
 await tap(fakeW('1:0',true),'opt',1,0);await tap(fakeW('1:0',true),'opt',1,2);await tap(fakeW('1:0',true),'sub',1,0);
 ok(lastUser().content==='pick ["tea","Pani"]','{json} for choice = JSON array of values');
 const FJ={v:1,id:'fj',blocks:[{type:'form',fields:[{key:'naam',label:'Naam',type:'text',required:true},{key:'umar',label:'Umar',type:'number'},{key:'chai',label:'Chai',type:'switch'},{key:'shehar',label:'Shehar',type:'text'}],submit:{label:'Bhejo',action:{type:'send',value:'form: {json}'}}}]};
 setH([{role:'user',content:'x'},{role:'assistant',local:1,content:'',aiNote:'w',ui:FJ}]);t('render()');script=['ok'];n=0;
 await tap(fakeW('1:0',true,[fld('naam',1,'Najeef','text'),fld('umar',1,'30','number'),fld('chai',1,'on','checkbox',true),fld('shehar',1,'Lucknow "UP"','text')]),'sub',1,0);
 ok(lastUser().content==='form: {"naam":"Najeef","umar":30,"chai":true,"shehar":"Lucknow \\"UP\\""}','{json} for form = real JSON (number as number, switch as true/false, quotes escaped)');
 // ---- rules (P4)
 ok(t("ruleAreas('login ka flowchart banao')").includes('diagram')&&t("ruleAreas('mermaid diagram do')").includes('diagram')&&t("ruleAreas('architecture dikhao')").includes('diagram')&&!t("ruleAreas('torch on kar')").includes('diagram'),'rules: area "diagram" for flowchart requests only');
 t("S.ui={off:true}");ok(!t("ruleAreas('flowchart banao')").includes('diagram')&&!t("ruleAreas('snake game')").includes('game'),'rules: switch off adds none of ui/game/diagram');t("S.ui={}");
 setH([{role:'user',content:'chat me ek quiz game banao aur flowchart bhi'}]);{const RB2=t('rulesBlock()');ok(/CHAT GAMES/.test(RB2)&&/DIAGRAMS/.test(RB2)&&/WIDGETS/.test(RB2),'rules: game + diagram + ui all fit together');}
 ok(/sequenceDiagram/.test(t('RULES.diagram'))&&/mermaid/.test(t('RULES.diagram'))&&/40 nodes/.test(t('RULES.diagram'))&&/NOT supported/.test(t('RULES.diagram')),'rules: diagram area lists mermaid support and limits');
 ok(/badge/.test(t('RULES.ui'))&&/red\|green\|blue\|grey/.test(t('RULES.ui'))&&/\{json\}/.test(t('RULES.ui'))&&/media \{kind:image/.test(t('RULES.ui'))&&/canvas \{kind:game/.test(t('RULES.ui'))&&/Older names also work/.test(t('RULES.ui')),'rules: ui area has badge colours, {json}, rev-2 names and says old names work');
 ok(/inline/.test(t('RULES.game'))&&/30000/.test(t('RULES.game')),'rules: game area mentions inline html (30000 chars)');
 ok(t("TOOLS.find(x=>x.function.name==='rules_read').function.parameters.properties.area.enum").includes('diagram')&&/rules_read diagram/.test(t("TOOLS.find(x=>x.function.name==='ui_render').function.description")),'rules_read enum has diagram; ui_render points to it');
 ok(/diagrams/.test(t('skillText()')),'skill text mentions diagrams');
 // ---- 8. rules / skill / enum
 ok(t("ruleAreas('ek quiz lo mera')").includes('ui')&&t("ruleAreas('torch on kar')").includes('ui')===false,'rule area "ui" is picked for quiz, not for torch');
 ok(/ui_render/.test(t("rulesTool({area:'ui'},s=>s,{})")),'rules_read ui works');
 ok(t("TOOLS.find(x=>x.function.name==='rules_read').function.parameters.properties.area.enum").includes('ui'),'rules_read enum has ui');
 ok(/ui_render/.test(t('skillText()')),'skill text lists ui_render');
 ok(t("RULES_VER")==='2026-11-22.2','RULES_VER bumped');
 ok(/```ui/.test(t("RULES.ui"))&&/HE says/.test(t("RULES.ui")),'rules tell the AI about the fence fallback and that a button value is Najeef\'s words');
 // ---- 9. switch off
 t("S.ui={off:true}");o=t('fmt')('```ui\n'+F+'\n```');ok(/<pre>/.test(o)&&/off hai/.test(o),'Rich UI off: fence stays code');
 t("S.ui={}");
 console.log(fails?'\nFAILED '+fails:'\nALL PASS');process.exit(fails?1:0);
})();
