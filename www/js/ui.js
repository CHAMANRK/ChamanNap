// 1.38000.0 Rich UI, phase P1: the AI shows a safe, declarative widget in the chat (buttons, choice/MCQ, form, table, key-value, alert, progress, code).
// Two ways in: the ui_render tool, or a ```ui fenced JSON block in the reply (works for chat-only models too). A tap sends a normal user message (a new AI turn).
// Safety: the JSON is never executed. uiValidate() builds a clean copy with only known types and props (unknown type = skipped), every text goes through esc(),
// the DOM carries only indexes (data-b / data-i), the action is looked up again from the stored widget when tapped. No script, no network, no raw HTML.
// P4 (1.41000.0): diagram (nodes JSON or a small mermaid flowchart subset, own layered layout, pan/zoom), badge, stat, inline html, rev-2 names (button/media/canvas) as aliases.
// P3 (1.40000.0): html block = a game file from /sdcard/Chaman/ui/ that runs in a sandboxed iframe in a panel above the chat (no network, no app data, one-way bridge chaman.send).
// P2 (1.39000.0): chart (bar/line/pie as inline SVG built from numbers), board (monospace grid), image (workspace path or gen:<id>), widgets that came from an older app run
// are 'expired' (static + hint), Settings switch "Rich UI in chat" (S.ui.off). Later phases (not here): html sandbox + bridge (P3), diagram, mermaid, inline html (P4).
const UI_MAX={inline:30000,dnodes:40,dedges:80,json:32768,blocks:60,elems:300,depth:5,str:2000,opts:20,fields:20,rows:100,cols:12,items:12,kv:50};
let UI_HI=-1,UI_K=0,UI_CHIP='',UI_INFO={},UI_N=0;
const UIG={fr:null,el:null,src:'',name:'',title:'',b:null,html:'',n:0,last:0,loads:0,pend:'',pt:0,seq:0};
const UI_FRESH=new WeakSet(),UI_ST={},UI_CACHE=new WeakMap(),UI_SCACHE=new Map(),UI_IDX=new WeakMap();
const uiOn=()=>!(S.ui&&S.ui.off===true);
const ea=t=>esc(String(t)).replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const uiHas=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);

// ---------- validator: raw JSON -> clean widget ----------
function uiStr(v,max,what){
  if(v==null)return'';
  if(typeof v==='number'||typeof v==='boolean')v=String(v);
  if(typeof v!=='string')return'';
  if(v.length>(max||UI_MAX.str))throw new Error((what||'text')+' bahut lamba (max '+(max||UI_MAX.str)+' akshar)');
  return v;
}
const uiKey=v=>{const s=String(v==null?'':v).trim();return /^[A-Za-z0-9_-]{1,32}$/.test(s)?s:''};
const uiNum=(v,d)=>{const n=typeof v==='number'?v:parseFloat(v);return isFinite(n)?n:d};
function uiCount(cx,k){cx.n+=(k==null?1:k);if(cx.n>UI_MAX.elems)throw new Error('elements '+UI_MAX.elems+' se zyada');}
// image src must be a picture inside the workspace (never notes/, never outside, no ..)
function uiImgPath(src){
  if(typeof fpath!=='function'||!src||/\.\.|\0/.test(src)||/^[a-z][a-z0-9+.-]*:/i.test(src))return''; // no url / data: / javascript: schemes
  const p=fpath(src);
  if(!p||p===WS_ROOT||!/\.(png|jpe?g|webp|gif|svg)$/i.test(p)||(typeof fNotes==='function'&&fNotes(p)))return'';
  return p;
}
function uiHtmlPath(src){
  if(typeof fpath!=='function'||!src||/\.\.|\0/.test(src)||/^[a-z][a-z0-9+.-]*:/i.test(src))return'';
  const p=fpath(src);
  return p&&p.indexOf(WS_ROOT+'/ui/')===0&&/\.html$/i.test(p)&&p.length>WS_ROOT.length+8?p:'';
}
function uiHash(t){let h=5381;for(let i=0;i<t.length;i++)h=((h<<5)+h+t.charCodeAt(i))|0;return(h>>>0).toString(16)+t.length.toString(16)}
const UI_COLORS={red:'red',green:'green',blue:'blue',grey:'grey',gray:'grey',yellow:'yellow',orange:'orange',purple:'purple',teal:'teal',cyan:'teal'};
const uiColor=c=>UI_COLORS[String(c||'').toLowerCase()]||'grey';
function uiMkBoard(b,cx){
  uiCount(cx);const rows=(Array.isArray(b.rows)?b.rows.slice(0,30):[]).map(r=>uiStr(r,80,'board row'));
  if(!rows.length){cx.n--;cx.skip++;return null}
  return{type:'board',rows,legend:uiStr(b.legend,300),size:['sm','md','lg'].includes(b.size)?b.size:'md'};
}
function uiMkImage(b,cx){
  uiCount(cx);let src=uiStr(b.src,300,'image src').trim();
  if(!/^gen:[A-Za-z0-9_-]{1,40}$/.test(src)){src=uiImgPath(src);if(!src){cx.n--;cx.skip++;return null}}
  return{type:'image',src,alt:uiStr(b.alt,200),caption:uiStr(b.caption,300),height:Math.max(60,Math.min(600,Math.round(uiNum(b.height,240))))};
}
// html: a game FILE in /sdcard/Chaman/ui/ (src) or a small inline page (html, <=30000 chars). Both run in the same sandbox panel.
function uiMkHtml(b,cx){
  uiCount(cx);let src=uiHtmlPath(uiStr(b.src,300,'html src').trim()),inl='';
  if(!src&&typeof b.html==='string'&&b.html.trim()){
    if(b.html.length>UI_MAX.inline)throw new Error('inline html '+UI_MAX.inline+' akshar se bada hai (file me likho: rules_read game)');
    inl=b.html;src='inline:'+uiHash(inl);
  }
  if(!src){cx.n--;cx.skip++;return null}
  return{type:'html',src,html:inl,title:uiStr(b.title,60),label:uiStr(b.label,30).trim()||'Play',height:Math.max(120,Math.min(700,Math.round(uiNum(b.height,460))))};
}
function uiAction(a,dflt){
  if(!a||typeof a!=='object'||Array.isArray(a))return dflt||{type:'none'};
  if(a.type==='send')return{type:'send',value:uiStr(a.value,1000,'action value'),silent:a.silent===true};
  if(a.type==='copy')return{type:'copy',value:uiStr(a.value,UI_MAX.str,'copy value')};
  return{type:'none'}; // open, call, sms, delete ... are not part of v1
}
function uiBlocks(arr,depth,cx){
  if(!Array.isArray(arr))return[];
  if(arr.length>UI_MAX.blocks)throw new Error('blocks '+UI_MAX.blocks+' se zyada');
  const o=[];for(const b of arr){const x=uiBlock(b,depth,cx);if(x)o.push(x)}return o;
}
function uiBlock(b,depth,cx){
  if(!b||typeof b!=='object'||Array.isArray(b)){cx.skip++;return null}
  if(depth>UI_MAX.depth)throw new Error('nesting '+UI_MAX.depth+' se zyada');
  const T=b.type;let o=null;
  switch(T){
    case'text':uiCount(cx);o={type:T,md:uiStr(b.md,UI_MAX.str,'text')};break;
    case'card':uiCount(cx);o={type:T,title:uiStr(b.title,200),subtitle:uiStr(b.subtitle,300),body:null,footer:null};
      o.body=uiBlocks(b.body,depth+1,cx);o.footer=uiBlocks(b.footer,depth+1,cx);break;
    case'button':case'buttons':{
      uiCount(cx);const items=[];
      for(const it of(Array.isArray(b.items)?b.items.slice(0,UI_MAX.items):[])){
        if(!it||typeof it!=='object')continue;const label=uiStr(it.label,80,'button label').trim();if(!label)continue;
        uiCount(cx);const st0=it.style||it.variant;items.push({label,style:['primary','secondary','danger'].includes(st0)?st0:'secondary',action:uiAction(it.action)});
      }
      if(!items.length){cx.n--;cx.skip++;return null}
      o={type:'buttons',items};break;
    }
    case'choice':{
      uiCount(cx);const opts=[];
      for(const it of(Array.isArray(b.options)?b.options.slice(0,UI_MAX.opts):[])){
        let label,value,desc='';
        if(it&&typeof it==='object'){label=uiStr(it.label,200,'option label').trim();value=it.value==null?label:uiStr(it.value,200,'option value');desc=uiStr(it.desc,300)}
        else{label=uiStr(it,200,'option').trim();value=label}
        if(!label)continue;uiCount(cx);opts.push({label,value,desc});
      }
      if(!opts.length){cx.n--;cx.skip++;return null}
      const s=b.submit&&typeof b.submit==='object'?{label:uiStr(b.submit.label,60).trim()||'OK',action:uiAction(b.submit.action,{type:'send',value:'{value}',silent:false})}:null;
      o={type:T,id:uiKey(b.id),mode:b.mode==='multi'?'multi':'single',options:opts,submit:s};break;
    }
    case'form':{
      uiCount(cx);const fields=[],seen={};
      for(const f of(Array.isArray(b.fields)?b.fields.slice(0,UI_MAX.fields):[])){
        if(!f||typeof f!=='object')continue;const key=uiKey(f.key);if(!key||seen[key])continue;
        const type=['text','number','select','switch','slider','date','textarea'].includes(f.type)?f.type:'text';
        let options=[];
        if(type==='select'){
          for(const q of(Array.isArray(f.options)?f.options.slice(0,UI_MAX.opts):[])){
            const label=uiStr(q&&typeof q==='object'?q.label:q,200,'option').trim(),value=q&&typeof q==='object'&&q.value!=null?uiStr(q.value,200):label;
            if(label)options.push({label,value});
          }
          if(!options.length)continue;
        }
        uiCount(cx);seen[key]=1;
        const min=uiNum(f.min,type==='slider'?0:null),max=uiNum(f.max,type==='slider'?100:null);
        fields.push({key,label:uiStr(f.label,120).trim()||key,type,placeholder:uiStr(f.placeholder,120),required:f.required===true,options,min,max});
      }
      if(!fields.length){cx.n--;cx.skip++;return null}
      o={type:T,id:uiKey(b.id),fields,submit:{label:b.submit&&typeof b.submit==='object'&&uiStr(b.submit.label,60).trim()||'Bhejo',action:uiAction(b.submit&&b.submit.action,{type:'send',value:'{values}',silent:false})}};break;
    }
    case'table':{
      uiCount(cx);const cols=[];
      for(const c of(Array.isArray(b.columns)?b.columns.slice(0,UI_MAX.cols):[])){
        if(!c||typeof c!=='object')continue;const key=String(c.key==null?'':c.key);if(!key)continue;
        uiCount(cx);cols.push({key:key.slice(0,60),label:uiStr(c.label,80).trim()||key.slice(0,60),align:['left','right','center'].includes(c.align)?c.align:(c.type==='number'?'right':'left'),type:c.type==='number'?'number':'text'});
      }
      if(!cols.length){cx.n--;cx.skip++;return null}
      const rows=[];
      for(const r of(Array.isArray(b.rows)?b.rows.slice(0,UI_MAX.rows):[])){
        if(!r||typeof r!=='object'||Array.isArray(r))continue;uiCount(cx);
        rows.push(cols.map(c=>uiHas(r,c.key)?uiStr(r[c.key],UI_MAX.str,'cell'):''));
      }
      o={type:T,columns:cols,rows,sortable:b.sortable===true};break;
    }
    case'keyvalue':{
      uiCount(cx);const rows=[];
      for(const r of(Array.isArray(b.rows)?b.rows.slice(0,UI_MAX.kv):[])){
        if(!r||typeof r!=='object')continue;uiCount(cx);rows.push({k:uiStr(r.k,200),v:uiStr(r.v,UI_MAX.str,'value')});
      }
      if(!rows.length){cx.n--;cx.skip++;return null}
      o={type:T,rows};break;
    }
    case'alert':uiCount(cx);o={type:T,style:['info','success','warn','error'].includes(b.style)?b.style:'info',title:uiStr(b.title,200),md:uiStr(b.md,UI_MAX.str,'alert text')};break;
    case'progress':{uiCount(cx);const mx=Math.max(1e-9,uiNum(b.max,100));o={type:T,value:Math.max(0,Math.min(mx,uiNum(b.value,0))),max:mx,label:uiStr(b.label,200)};break}
    case'code':uiCount(cx);o={type:T,lang:uiStr(b.lang,20).replace(/[^\w+#.-]/g,''),code:uiStr(b.code,UI_MAX.str,'code')};break;
    case'chart':{
      uiCount(cx);
      const labels=(Array.isArray(b.labels)?b.labels.slice(0,24):[]).map(x=>uiStr(x,60,'chart label')),series=[];
      for(const q of(Array.isArray(b.series)?b.series.slice(0,6):[])){
        if(!q||typeof q!=='object')continue;
        const vals=labels.map((_,i)=>Array.isArray(q.values)?uiNum(q.values[i],0):0);
        uiCount(cx);series.push({name:uiStr(q.name,60),values:vals});
      }
      if(!labels.length||!series.length){cx.n--;cx.skip++;return null}
      uiCount(cx,labels.length);
      o={type:T,kind:['bar','line','pie'].includes(b.kind)?b.kind:'bar',title:uiStr(b.title,120),unit:uiStr(b.unit,12),labels,series};break;
    }
    case'board':o=uiMkBoard(b,cx);if(!o)return null;break;
    case'image':case'media':
      if(T==='media'&&b.kind&&b.kind!=='image'){cx.skip++;return null} // gallery/video/audio/... come later
      o=uiMkImage(b,cx);if(!o)return null;break;
    case'html':o=uiMkHtml(b,cx);if(!o)return null;break;
    case'canvas':
      if(b.kind==='board')o=uiMkBoard(b,cx);else if(!b.kind||b.kind==='game')o=uiMkHtml(b,cx);else{cx.skip++;return null}
      if(!o)return null;break;
    case'badge':{
      uiCount(cx);const items=[],raw=Array.isArray(b.items)?b.items:(b.label!=null?[b]:[]);
      for(const it of raw.slice(0,24)){
        const o2=it&&typeof it==='object'?it:{label:it},label=uiStr(o2.label,40,'badge label').trim();if(!label)continue;
        uiCount(cx);items.push({label,color:uiColor(o2.color),action:o2.action?uiAction(o2.action):null});
      }
      if(!items.length){cx.n--;cx.skip++;return null}
      o={type:T,items};break;
    }
    case'stat':{
      uiCount(cx);const items=[],state=['empty','loading','skeleton'].includes(b.state)?b.state:'';
      for(const it of(Array.isArray(b.items)?b.items.slice(0,24):[])){
        if(!it||typeof it!=='object')continue;
        uiCount(cx);const type=['text','number','badge','progress','ring','status'].includes(it.type)?(it.type==='ring'?'progress':it.type):'text';
        items.push({k:uiStr(it.k,200),v:uiStr(it.v,UI_MAX.str,'stat value'),type,color:uiColor(it.color),max:Math.max(1e-9,uiNum(it.max,100))});
      }
      if(!items.length&&!state){cx.n--;cx.skip++;return null}
      o={type:T,items,state};break;
    }
    case'diagram':{
      uiCount(cx);
      const fmt=b.format==='mermaid'||(b.code&&!b.nodes)?'mermaid':'nodes';let dir=b.dir==='LR'||b.direction==='LR'?'LR':'TB',nr=b.nodes,er=b.edges;
      if(fmt==='mermaid'){const m=uiMermaid(uiStr(b.code,UI_MAX.str,'mermaid code'));if(m.err)throw new Error('diagram mermaid: '+m.err);nr=m.nodes;er=m.edges;dir=m.dir}
      const d=uiDgNorm(nr,er,cx);
      if(!d.nodes.length){cx.n--;cx.skip++;return null}
      o={type:T,title:uiStr(b.title,120),dir,nodes:d.nodes,edges:d.edges};break;
    }
    case'divider':case'spacer':uiCount(cx);o={type:T};break;
    default:cx.skip++;return null; // unknown (or a later-phase type like chart/html/diagram): silently skipped
  }
  return o;
}
// raw = object or JSON string. Returns {ok:true,ui:{v,id,title,keep,blocks,skipped}} or {ok:false,err}
function uiValidate(raw){
  let o=raw;
  try{
    if(typeof raw==='string'){if(raw.length>UI_MAX.json)return{ok:false,err:'JSON '+(UI_MAX.json/1024)+'KB se bada hai'};o=JSON.parse(raw)}
    else if(JSON.stringify(raw==null?null:raw).length>UI_MAX.json)return{ok:false,err:'JSON '+(UI_MAX.json/1024)+'KB se bada hai'};
  }catch(e){return{ok:false,err:'JSON galat ('+e.message+')'}}
  if(!o||typeof o!=='object'||Array.isArray(o))return{ok:false,err:'widget ek JSON object hona chahiye'};
  if(o.v!=null&&o.v!==1&&o.v!=='1')return{ok:false,err:'v 1 hona chahiye'};
  if(!Array.isArray(o.blocks)||!o.blocks.length)return{ok:false,err:'blocks ki list chahiye'};
  const cx={n:0,skip:0};
  try{
    const blocks=uiBlocks(o.blocks,1,cx);
    if(!blocks.length)return{ok:false,err:'koi valid block nahi mila'};
    let id=String(o.id==null?'':o.id).toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,32);
    if(!id)id='w'+(++UI_N);
    return{ok:true,ui:{v:1,id,title:uiStr(o.title,120).trim(),keep:o.keep===true,blocks,skipped:cx.skip}};
  }catch(e){return{ok:false,err:e.message}}
}
function uiIndex(ui){ // bid -> block (ids are assigned here, in walk order, so the DOM only needs a number)
  let ix=UI_IDX.get(ui);if(ix)return ix;
  ix={};let n=0;
  const walk=L=>(L||[]).forEach(b=>{b.bid=++n;ix[n]=b;if(b.type==='card'){walk(b.body);walk(b.footer)}});
  walk(ui.blocks);UI_IDX.set(ui,ix);return ix;
}
function uiVal(m){ // widget stored by the tool in a message
  let r=UI_CACHE.get(m.ui);if(!r){r=uiValidate(m.ui);UI_CACHE.set(m.ui,r)}return r;
}
function uiValStr(s){
  let r=UI_SCACHE.get(s);if(!r){r=uiValidate(s);if(UI_SCACHE.size>60)UI_SCACHE.clear();UI_SCACHE.set(s,r)}return r;
}
const UI_FENCE=()=>/```([\w+#.-]*)[ \t]*\n?([\s\S]*?)(?:```|$)/g;
function uiExtract(m){ // [{k,ui}] valid widgets of one message; k counts every ```ui fence, valid or not (same order fmt() uses)
  if(!m||m.role!=='assistant'||m.err)return[];
  if(m.ui){const r=uiVal(m);return r.ok?[{k:0,ui:r.ui}]:[]}
  const t=String(m.content||'');if(t.indexOf('```')<0)return[];
  const out=[],re=UI_FENCE();let x,k=0;
  while((x=re.exec(t))){
    if(x[1].toLowerCase()==='ui'){const closed=x[0].lastIndexOf('```')>0,r=closed?uiValStr(x[2]):{ok:false};if(r.ok)out.push({k,ui:r.ui});k++}
    if(re.lastIndex>=t.length)break;
  }
  return out;
}
// live = can be tapped. Only the newest widget is live (after a user message it freezes), unless keep:true. Same id later = replaced (old).
function uiScan(){
  const L=[];let lastUser=-1;
  H.forEach((m,hi)=>{if(m.role==='user')lastUser=hi;uiExtract(m).forEach(w=>L.push({hi,k:w.k,id:w.ui.id,keep:w.ui.keep,fresh:UI_FRESH.has(m)}))});
  const info={};
  L.forEach((w,i)=>{
    const later=L.slice(i+1).some(x=>x.id===w.id),isLast=i===L.length-1;
    info[w.hi+':'+w.k]=later?'old':!w.fresh?'expired':(w.keep||(isLast&&w.hi>lastUser))?'live':'frozen';
  });
  UI_INFO=info;
  if(UIG.src){
    let has=false;
    H.forEach(m=>uiExtract(m).forEach(w=>{const ix=uiIndex(w.ui);for(const k in ix)if(ix[k].type==='html'&&ix[k].src===UIG.src)has=true}));
    if(!has||!uiOn())uiGClose();
  }
}
// a widget message made in this app run is fresh; anything loaded from storage or an old session is not (it shows as expired)
function uiFresh(m){if(m&&typeof m==='object')UI_FRESH.add(m)}
const uiTools=()=>uiOn()?TOOLS:TOOLS.filter(t=>t.function.name!=='ui_render');
function uiCtx(hi){UI_HI=hi;UI_K=0;return''}
const uiHide=(m,hi)=>!!(m&&m.ui&&UI_INFO[hi+':0']==='old');
const uiStat=key=>UI_INFO[key]||'frozen';

// ---------- renderer: clean widget -> HTML string (every text escaped) ----------
const uiSt=(key,bid)=>UI_ST[key+'|'+bid]||(UI_ST[key+'|'+bid]={sel:[],v:{},sort:null});
function uiW(ui,key,st){
  uiIndex(ui);const live=st==='live';
  return'<div class="uiw'+(live?'':' frz')+'" data-ui="'+ea(key)+'" data-live="'+(live?1:0)+'">'+(ui.title?'<div class="uit">'+esc(ui.title)+'</div>':'')+ui.blocks.map(b=>uiB(b,key,live)).join('')+(st==='expired'?'<div class="uiexp">Ye widget purana hai (app dobara khuli), ab tap nahi hota. Naya maang lo.</div>':'')+'</div>';
}
function uiB(b,key,live){
  const id=b.bid;
  switch(b.type){
    case'text':return'<div class="uimd">'+mdBlocks(b.md)+'</div>';
    case'card':return'<div class="uic">'+(b.title||b.subtitle?'<div class="uich-h">'+(b.title?'<b>'+esc(b.title)+'</b>':'')+(b.subtitle?'<small>'+esc(b.subtitle)+'</small>':'')+'</div>':'')+b.body.map(x=>uiB(x,key,live)).join('')+(b.footer.length?'<div class="uicf">'+b.footer.map(x=>uiB(x,key,live)).join('')+'</div>':'')+'</div>';
    case'buttons':return'<div class="uibtns">'+b.items.map((it,i)=>'<button type="button" class="uib '+(it.style==='primary'?'p':it.style==='danger'?'d':'s')+'" data-ua="btn" data-b="'+id+'" data-i="'+i+'"'+(live||it.action.type==='copy'?'':' disabled')+'>'+esc(it.label)+'</button>').join('')+'</div>';
    case'choice':{
      const s=uiSt(key,id);
      return'<div class="uich" role="'+(b.mode==='multi'?'group':'radiogroup')+'">'+b.options.map((o,i)=>{
        const on=s.sel.indexOf(i)>=0;
        return'<button type="button" class="uio'+(on?' on':'')+(b.mode==='multi'?' mu':'')+'" role="'+(b.mode==='multi'?'checkbox':'radio')+'" aria-checked="'+(on?'true':'false')+'" data-ua="opt" data-b="'+id+'" data-i="'+i+'"'+(live?'':' disabled')+'><span class="uim"></span><span class="uol">'+esc(o.label)+(o.desc?'<small>'+esc(o.desc)+'</small>':'')+'</span></button>';
      }).join('')+(b.submit?'<button type="button" class="uib p" data-ua="sub" data-b="'+id+'"'+(live&&s.sel.length?'':' disabled')+'>'+esc(b.submit.label)+'</button>':'')+'</div>';
    }
    case'form':{
      const s=uiSt(key,id);
      return'<div class="uif">'+b.fields.map(f=>{
        const v=uiHas(s.v,f.key)?s.v[f.key]:(f.type==='slider'?String(f.min):''),dis=live?'':' disabled',at=' data-uf="1" data-b="'+id+'" data-k="'+ea(f.key)+'"'+dis;
        let inp;
        if(f.type==='textarea')inp='<textarea rows="3" maxlength="1000" placeholder="'+ea(f.placeholder)+'"'+at+'>'+esc(v)+'</textarea>';
        else if(f.type==='select')inp='<select'+at+'><option value="">Chuno</option>'+f.options.map(o=>'<option value="'+ea(o.value)+'"'+(String(v)===o.value?' selected':'')+'>'+esc(o.label)+'</option>').join('')+'</select>';
        else if(f.type==='switch')inp='<input type="checkbox" class="uisw"'+(v===true||v==='on'?' checked':'')+at+'>';
        else if(f.type==='slider')inp='<div class="uisl"><input type="range" min="'+f.min+'" max="'+f.max+'" value="'+ea(v)+'"'+at+'><span class="uisv">'+esc(v)+'</span></div>';
        else if(f.type==='number')inp='<input type="number" inputmode="decimal"'+(f.min!=null?' min="'+f.min+'"':'')+(f.max!=null?' max="'+f.max+'"':'')+' placeholder="'+ea(f.placeholder)+'" value="'+ea(v)+'"'+at+'>';
        else if(f.type==='date')inp='<input type="date" value="'+ea(v)+'"'+at+'>';
        else inp='<input type="text" maxlength="500" placeholder="'+ea(f.placeholder)+'" value="'+ea(v)+'"'+at+'>';
        return'<label class="uifl'+(f.type==='switch'?' row':'')+'"><span>'+esc(f.label)+(f.required?' *':'')+'</span>'+inp+'</label>';
      }).join('')+'<div class="uierr" data-e="'+id+'" role="alert"></div><button type="button" class="uib p" data-ua="sub" data-b="'+id+'"'+dis0(live)+'>'+esc(b.submit.label)+'</button></div>';
    }
    case'table':{
      const s=uiSt(key,id),rows=b.rows.map((r,i)=>({r,i}));
      if(b.sortable&&s.sort){
        const c=s.sort.c,num=b.columns[c]&&b.columns[c].type==='number',d=s.sort.d;
        rows.sort((a,z)=>{
          let x=a.r[c],y=z.r[c];
          if(num){x=parseFloat(String(x).replace(/,/g,''));y=parseFloat(String(y).replace(/,/g,''));const nx=isNaN(x),ny=isNaN(y);if(nx||ny)return nx&&ny?a.i-z.i:nx?1:-1;return d*(x-y)||a.i-z.i}
          return d*String(x).localeCompare(String(y))||a.i-z.i;
        });
      }
      return'<div class="tw"><table><thead><tr>'+b.columns.map((c,i)=>'<th class="'+(b.sortable?'srt':'')+'" style="text-align:'+c.align+'"'+(b.sortable?' data-ua="sort" data-b="'+id+'" data-i="'+i+'" role="button" tabindex="0"'+(s.sort&&s.sort.c===i?' data-d="'+(s.sort.d>0?'a':'z')+'"':''):'')+'>'+esc(c.label)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(x=>'<tr>'+b.columns.map((c,i)=>'<td style="text-align:'+c.align+'">'+esc(x.r[i])+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
    }
    case'keyvalue':return'<div class="uikv">'+b.rows.map(r=>'<div class="uik">'+esc(r.k)+'</div><div class="uiv">'+esc(r.v)+'</div>').join('')+'</div>';
    case'alert':return'<div class="uia '+b.style+'" role="note">'+(b.title?'<b>'+esc(b.title)+'</b>':'')+(b.md?'<div>'+mdBlocks(b.md)+'</div>':'')+'</div>';
    case'progress':{const pc=(b.value/b.max*100).toFixed(1);return'<div class="uipr">'+(b.label?'<div class="uipl">'+esc(b.label)+'</div>':'')+'<div class="uipb" role="progressbar" aria-valuemin="0" aria-valuemax="'+b.max+'" aria-valuenow="'+b.value+'"><i style="width:'+pc+'%"></i></div></div>'}
    case'code':return'<div class="code"><div class="cbar">'+(b.lang?'<span class="lang">'+esc(b.lang)+'</span>':'')+'<button type="button" class="cp" aria-label="Copy code">'+ICO_COPY+'</button></div><pre><code>'+esc(b.code)+'</code></pre></div>';
    case'html':return'<div class="uig"><div class="uigi"><b>'+esc(b.title||(b.html?'Demo':uiGName(b.src)))+'</b><small>'+esc(b.html?'inline html':b.src.replace(WS_ROOT+'/',''))+'</small></div><button type="button" class="uib p" data-ua="play" data-b="'+id+'">'+esc(b.label)+'</button></div>';
    case'diagram':return uiDiagramH(b,key,id);
    case'stat':return uiStatH(b);
    case'badge':return'<div class="uibgs">'+b.items.map((it,i)=>it.action&&it.action.type!=='none'?'<button type="button" class="uibg tap '+it.color+'" data-ua="bdg" data-b="'+id+'" data-i="'+i+'"'+(live||it.action.type==='copy'?'':' disabled')+'>'+esc(it.label)+'</button>':'<span class="uibg '+it.color+'">'+esc(it.label)+'</span>').join('')+'</div>';
    case'chart':return uiChartH(b);
    case'board':return'<div class="uibd '+b.size+'"><div class="tw"><pre class="uibp">'+b.rows.map(esc).join('\n')+'</pre></div>'+(b.legend?'<div class="uibl">'+esc(b.legend)+'</div>':'')+'</div>';
    case'image':{
      const u=uiImgUrl(b.src);
      if(u==='err')return'<div class="uierr">Image nahi mili ('+esc(b.src.indexOf('gen:')===0?'ab memory me nahi, save nahi hui thi':b.src.replace(WS_ROOT+'/',''))+')</div>';
      if(!u)return'<div class="uiimg ph" data-isrc="'+ea(b.src)+'" style="height:'+b.height+'px"><span>Image load ho rahi hai</span></div>';
      return'<figure class="uiimg"><img src="'+ea(u)+'" alt="'+ea(b.alt)+'" style="max-height:'+b.height+'px">'+(b.caption?'<figcaption>'+esc(b.caption)+'</figcaption>':'')+'</figure>';
    }
    case'divider':return'<hr>';
    case'spacer':return'<div class="uisp"></div>';
  }
  return'';
}
const dis0=live=>live?'':' disabled';
// ---- chart: inline SVG, every coordinate comes from numbers (toFixed), every text through esc() ----
const uiC=n=>(+n).toFixed(1);
const uiF=n=>{n=+n;if(!isFinite(n))return'0';const a=Math.abs(n);return a>=1e6?(+(n/1e6).toFixed(1))+'M':a>=1e4?(+(n/1e3).toFixed(1))+'k':String(+n.toFixed(2))};
function uiNice(lo,hi){
  const raw=(hi-lo||1)/4,p=Math.pow(10,Math.floor(Math.log10(raw))),f=raw/p,st=(f<=1?1:f<=2?2:f<=5?5:10)*p;
  return{lo:Math.floor(lo/st+1e-9)*st,hi:Math.ceil(hi/st-1e-9)*st,st};
}
const uiCut=(t,n)=>t.length>n?t.slice(0,n-1)+'.':t;
function uiChartH(b){
  const n=b.labels.length,ns=b.series.length,pie=b.kind==='pie';
  const head=(b.title||b.unit?'<div class="uct">'+esc(b.title)+(b.unit?' <small>('+esc(b.unit)+')</small>':'')+'</div>':'');
  const aria=ea(b.kind+' chart, '+b.series.map(s=>s.name||'series').join(', ')+', '+n+' points');
  let body='',lg='';
  if(pie){
    const vals=b.labels.map((l,i)=>Math.max(0,b.series[0].values[i]||0)),tot=vals.reduce((a,x)=>a+x,0);
    if(tot<=0)return head+'<div class="uierr">Chart ka data khaali hai.</div>';
    let a0=-Math.PI/2,sl='';
    vals.forEach((v,i)=>{
      if(v<=0)return;const fr=v/tot,a1=a0+fr*2*Math.PI;
      if(fr>=0.9999)sl+='<circle class="c'+(i%6)+'" cx="100" cy="100" r="88"></circle>';
      else sl+='<path class="c'+(i%6)+'" d="M100 100L'+uiC(100+88*Math.cos(a0))+' '+uiC(100+88*Math.sin(a0))+'A88 88 0 '+(fr>.5?1:0)+' 1 '+uiC(100+88*Math.cos(a1))+' '+uiC(100+88*Math.sin(a1))+'Z"></path>';
      a0=a1;
    });
    body='<svg class="upie" viewBox="0 0 200 200" role="img" aria-label="'+aria+'">'+sl+'</svg>';
    lg='<div class="ulg col">'+b.labels.map((l,i)=>vals[i]>0?'<span><i class="c'+(i%6)+'"></i>'+esc(l)+' <small>'+uiF(vals[i])+' ('+(vals[i]/tot*100).toFixed(0)+'%)</small></span>':'').join('')+'</div>';
  }else{
    const W=360,Hh=210,pl=40,pr=8,pt=14,pb=n>6?54:28;
    let lo=0,hi=0;b.series.forEach(s=>s.values.forEach(v=>{if(v<lo)lo=v;if(v>hi)hi=v}));
    if(hi===lo)hi=lo+1;
    const nz=uiNice(lo,hi);lo=nz.lo;hi=nz.hi;
    const ph=Hh-pt-pb,y=v=>pt+(1-(v-lo)/(hi-lo))*ph,gw=(W-pl-pr)/n;let g='';
    const cnt=Math.min(10,Math.round((hi-lo)/nz.st));
    for(let i=0;i<=cnt;i++){const t=lo+i*nz.st,yy=y(t);g+='<line class="ug" x1="'+pl+'" x2="'+(W-pr)+'" y1="'+uiC(yy)+'" y2="'+uiC(yy)+'"></line><text class="ut" x="'+(pl-4)+'" y="'+uiC(yy+3)+'" text-anchor="end">'+uiF(t)+'</text>'}
    b.labels.forEach((l,i)=>{const x=pl+(i+.5)*gw,yy=Hh-pb+13;g+='<text class="ut" x="'+uiC(x)+'" y="'+uiC(yy)+'" text-anchor="'+(n>6?'end':'middle')+'"'+(n>6?' transform="rotate(-35 '+uiC(x)+' '+uiC(yy)+')"':'')+'>'+esc(uiCut(l,10))+'</text>'});
    const y0=y(0),showV=n*ns<=10;
    if(b.kind==='bar'){
      const bw=Math.max(2,Math.min(30,gw*.72/ns));
      b.series.forEach((s,j)=>s.values.forEach((v,i)=>{
        const x=pl+i*gw+(gw-bw*ns)/2+j*bw,yy=y(v),top=Math.min(yy,y0),h=Math.abs(yy-y0);
        if(h>=.3)g+='<rect class="c'+(j%6)+'" x="'+uiC(x)+'" y="'+uiC(top)+'" width="'+uiC(Math.max(1,bw-1))+'" height="'+uiC(h)+'" rx="2"></rect>';
        if(showV)g+='<text class="ut v" x="'+uiC(x+bw/2)+'" y="'+uiC(v>=0?top-3:top+h+10)+'" text-anchor="middle">'+uiF(v)+'</text>';
      }));
    }else{
      b.series.forEach((s,j)=>{
        const pts=s.values.map((v,i)=>[pl+(i+.5)*gw,y(v)]);
        g+='<polyline class="l'+(j%6)+'" fill="none" points="'+pts.map(q=>uiC(q[0])+','+uiC(q[1])).join(' ')+'"></polyline>';
        pts.forEach(q=>{g+='<circle class="c'+(j%6)+'" cx="'+uiC(q[0])+'" cy="'+uiC(q[1])+'" r="3"></circle>'});
      });
    }
    body='<svg class="usv" viewBox="0 0 '+W+' '+Hh+'" role="img" aria-label="'+aria+'">'+g+'</svg>';
    if(ns>1)lg='<div class="ulg">'+b.series.map((s,j)=>'<span><i class="c'+(j%6)+'"></i>'+esc(s.name||'Series '+(j+1))+'</span>').join('')+'</div>';
  }
  return'<div class="ucw">'+head+body+lg+'</div>';
}
// ---- diagram (P4): nodes+edges -> layered layout -> inline SVG; a small mermaid flowchart subset is converted to the same nodes+edges ----
const UI_SHAPES={box:'box',rect:'box',rectangle:'box',round:'round',stadium:'round',pill:'round',start:'round',end:'round',terminal:'round',diamond:'diamond',decision:'diamond',rhombus:'diamond',circle:'circle',ellipse:'circle'};
function uiDgNorm(nodesRaw,edgesRaw,cx){
  const nodes=[],ix={};
  const addN=(id,label,shape)=>{
    if(ix[id])return;
    if(nodes.length>=UI_MAX.dnodes)throw new Error('diagram: '+UI_MAX.dnodes+' se zyada node');
    uiCount(cx);ix[id]=1;nodes.push({id,label:label||id,shape:UI_SHAPES[shape]||'box'});
  };
  for(const n of(Array.isArray(nodesRaw)?nodesRaw:[])){
    if(!n||typeof n!=='object')continue;const id=uiKey(n.id);if(!id)continue;
    addN(id,uiStr(n.label,80,'node label').trim(),String(n.shape||'').toLowerCase());
  }
  const edges=[];
  for(const e of(Array.isArray(edgesRaw)?edgesRaw:[])){
    if(!e||typeof e!=='object')continue;const f=uiKey(e.from),t=uiKey(e.to);if(!f||!t)continue;
    if(edges.length>=UI_MAX.dedges)throw new Error('diagram: '+UI_MAX.dedges+' se zyada edge');
    addN(f,'','box');addN(t,'','box');uiCount(cx);
    edges.push({from:f,to:t,label:uiStr(e.label,40).trim(),style:['dashed','thick'].includes(e.style)?e.style:'solid',arrow:e.arrow!==false});
  }
  return{nodes,edges};
}
// mermaid subset: graph|flowchart TD|TB|BT|LR|RL, nodes A A[t] A(t) A([t]) A((t)) A[[t]] A{t}, arrows --> --- -.-> -.- ==> === with |text| or -- text -->, chains, A & B --> C, %% comments.
// subgraph/end/style/classDef/class/linkStyle/click lines are ignored. Anything else = a clear error (nothing is guessed).
function uiMermaid(code){
  const nodes=[],edges=[],seen={};let dir='TB';
  const NODE=/^([A-Za-z0-9_]{1,32})(?:\(\((.*?)\)\)|\(\[(.*?)\]\)|\[\[(.*?)\]\]|\[(.*?)\]|\((.*?)\)|\{(.*?)\})?/;
  const clean=t=>String(t).trim().replace(/^"(.*)"$/,'$1').replace(/<br\s*\/?>/gi,' ');
  const reg=(id,lab,shape)=>{
    if(seen[id]===undefined){seen[id]=nodes.length;nodes.push({id,label:lab!=null?clean(lab):id,shape:shape||'box'})}
    else if(lab!=null){nodes[seen[id]].label=clean(lab);if(shape)nodes[seen[id]].shape=shape}
  };
  const arrow=r=>{
    let m;
    const cls=t=>({style:t[0]==='='?'thick':t.indexOf('.')>=0?'dashed':'solid',arrow:/>$/.test(t)});
    if((m=r.match(/^--\s+(.+?)\s+(-->|---)\s*/)))return Object.assign(cls(m[2]),{len:m[0].length,label:clean(m[1])});
    if((m=r.match(/^-\.\s+(.+?)\s+(\.->|\.-)\s*/)))return Object.assign(cls('-.'+m[2]),{len:m[0].length,label:clean(m[1])});
    if((m=r.match(/^==\s+(.+?)\s+(==>|===)\s*/)))return Object.assign(cls(m[2]),{len:m[0].length,label:clean(m[1])});
    if((m=r.match(/^(-{2,}>|-{3,}|-\.+->|-\.+-|={2,}>|={3,})\s*(?:\|([^|]*)\|)?\s*/)))return Object.assign(cls(m[1]),{len:m[0].length,label:m[2]!=null?clean(m[2]):''});
    return null;
  };
  for(const raw of String(code).replace(/\r/g,'').split(/\n|;/)){
    let rest=raw.trim();if(!rest||/^%%/.test(rest))continue;
    if(/^(sequenceDiagram|gantt|classDiagram|stateDiagram|erDiagram|journey|pie|mindmap|timeline|gitGraph|quadrantChart|xychart|block|sankey)\b/i.test(rest))return{err:'sirf graph/flowchart chalta hai ('+rest.split(/\s/)[0]+' nahi)'};
    if(/^(graph|flowchart)\b/i.test(rest)){const m=rest.match(/^(?:graph|flowchart)\s+(TB|TD|BT|LR|RL)\b/i);if(m)dir=/LR|RL/i.test(m[1])?'LR':'TB';continue}
    if(/^(subgraph|end|classDef|class|style|linkStyle|click|direction)\b/i.test(rest))continue;
    let prev=null,pend=null;
    for(;;){
      const list=[];
      for(;;){
        const m=rest.match(NODE);if(!m)return{err:'samajh nahi aaya: "'+rest.slice(0,24)+'"'};
        const sh=m[2]!=null?'circle':m[3]!=null?'round':m[4]!=null||m[5]!=null?'box':m[6]!=null?'round':m[7]!=null?'diamond':null;
        const lab=[m[2],m[3],m[4],m[5],m[6],m[7]].find(x=>x!=null);
        reg(m[1],lab,sh);list.push(m[1]);rest=rest.slice(m[0].length).trimStart();
        if(rest[0]==='&'){rest=rest.slice(1).trimStart();continue}
        break;
      }
      if(prev)for(const f of prev)for(const t of list)edges.push({from:f,to:t,label:pend.label,style:pend.style,arrow:pend.arrow});
      if(!rest)break;
      const a=arrow(rest);if(!a)return{err:'arrow samajh nahi aaya: "'+rest.slice(0,24)+'"'};
      pend=a;rest=rest.slice(a.len).trimStart();prev=list;
    }
  }
  if(!nodes.length)return{err:'koi node nahi mila'};
  return{nodes,edges,dir};
}
function uiWrap(label,max,maxLines){
  const words=String(label).split(/\s+/).filter(Boolean),lines=[];let cur='';
  for(let w of words){
    while(w.length>max){if(cur){lines.push(cur);cur=''}lines.push(w.slice(0,max));w=w.slice(max)}
    if(!cur)cur=w;else if((cur+' '+w).length<=max)cur+=' '+w;else{lines.push(cur);cur=w}
  }
  if(cur)lines.push(cur);
  if(lines.length>maxLines){const k=lines.slice(0,maxLines);k[maxLines-1]=k[maxLines-1].replace(/.{0,2}$/,'..');return k}
  return lines.length?lines:[''];
}
// layered layout: break cycles (DFS back edges), longest-path layers, dummy vertices for long edges, barycenter ordering, simple coordinate relaxation.
function uiDgLayout(d){
  const lr=d.dir==='LR',G=26,LG=48;
  const N=d.nodes.map((n,i)=>{
    const lines=uiWrap(n.label,16,3),tw=Math.max(...lines.map(l=>l.length))*7.2;
    let w=Math.max(64,Math.ceil(tw+28)),h=Math.max(38,lines.length*15+22);
    if(n.shape==='diamond'){w=Math.ceil(w*1.4);h=Math.ceil(h*1.5)}else if(n.shape==='circle'){w=h=Math.max(56,Math.ceil(tw*1.1+18),lines.length*15+26)}
    return{id:n.id,label:n.label,shape:n.shape,i,lines,w,h};
  });
  const idx={};N.forEach(n=>idx[n.id]=n.i);
  const E=d.edges.map(e=>({e,f:idx[e.from],t:idx[e.to]}));
  const adj=N.map(()=>[]);E.forEach((x,k)=>{if(x.f!==x.t)adj[x.f].push([x.t,k])});
  const state=N.map(()=>0),rev=new Set();
  const dfs=u=>{state[u]=1;for(const[v,k]of adj[u]){if(state[v]===1)rev.add(k);else if(state[v]===0)dfs(v)}state[u]=2};
  for(let u=0;u<N.length;u++)if(!state[u])dfs(u);
  const dag=E.map((x,k)=>x.f===x.t?null:(rev.has(k)?[x.t,x.f]:[x.f,x.t]));
  const indeg=N.map(()=>0),out=N.map(()=>[]);
  dag.forEach(q=>{if(q){indeg[q[1]]++;out[q[0]].push(q[1])}});
  const layer=N.map(()=>0),queue=[];N.forEach(n=>{if(!indeg[n.i])queue.push(n.i)});
  while(queue.length){const u=queue.shift();for(const v of out[u]){layer[v]=Math.max(layer[v],layer[u]+1);if(--indeg[v]===0)queue.push(v)}}
  const V=N.map(n=>({n,layer:layer[n.i],w:n.w,h:n.h,dummy:false}));
  const chains=[],up=[],down=[];
  const link=(a,b)=>{(down[a]=down[a]||[]).push(b);(up[b]=up[b]||[]).push(a)};
  dag.forEach((q,k)=>{
    if(!q){chains[k]=null;return}
    const ch=[q[0]];
    for(let l=layer[q[0]]+1;l<layer[q[1]];l++){V.push({n:null,layer:l,w:8,h:8,dummy:true});ch.push(V.length-1)}
    ch.push(q[1]);chains[k]=ch;for(let j=0;j<ch.length-1;j++)link(ch[j],ch[j+1]);
  });
  const nl=Math.max(0,...V.map(v=>v.layer))+1,L=Array.from({length:nl},()=>[]);
  V.forEach((v,i)=>L[v.layer].push(i));
  const pos=V.map(()=>0);L.forEach(a=>a.forEach((v,j)=>pos[v]=j));
  const bary=(arr,nb)=>{
    const key={};arr.forEach(v=>{const q=nb[v];key[v]=q&&q.length?q.reduce((a,u)=>a+pos[u],0)/q.length:pos[v]});
    arr.sort((a,b)=>key[a]-key[b]||pos[a]-pos[b]);arr.forEach((v,j)=>pos[v]=j);
  };
  for(let it=0;it<6;it++){for(let l=1;l<nl;l++)bary(L[l],up);for(let l=nl-2;l>=0;l--)bary(L[l],down)}
  const mainS=v=>lr?v.w:v.h,crossS=v=>lr?v.h:v.w,cross=V.map(()=>0),main=V.map(()=>0);
  let m0=0;
  L.forEach(a=>{
    const ext=Math.max(8,...a.map(v=>mainS(V[v])));
    a.forEach(v=>main[v]=m0+ext/2);m0+=ext+LG;
    let x=0;a.forEach(v=>{cross[v]=x+crossS(V[v])/2;x+=crossS(V[v])+G});
    const tot=x-G;a.forEach(v=>cross[v]-=tot/2);
  });
  const relax=(arr,nb)=>{
    const want=arr.map(v=>{const q=nb[v];return q&&q.length?q.reduce((a,u)=>a+cross[u],0)/q.length:cross[v]});
    const x=want.slice();
    for(let j=1;j<arr.length;j++)x[j]=Math.max(x[j],x[j-1]+(crossS(V[arr[j-1]])+crossS(V[arr[j]]))/2+G);
    let sh=0;arr.forEach((v,j)=>sh+=want[j]-x[j]);sh/=arr.length;
    arr.forEach((v,j)=>cross[v]=x[j]+sh);
  };
  for(let it=0;it<4;it++){for(let l=1;l<nl;l++)relax(L[l],up);for(let l=nl-2;l>=0;l--)relax(L[l],down)}
  let minC=1e9,maxC=-1e9,minM=1e9,maxM=-1e9;
  V.forEach((v,i)=>{minC=Math.min(minC,cross[i]-crossS(v)/2);maxC=Math.max(maxC,cross[i]+crossS(v)/2);minM=Math.min(minM,main[i]-mainS(v)/2);maxM=Math.max(maxM,main[i]+mainS(v)/2)});
  const P=24;
  const X=i=>(lr?main[i]-minM:cross[i]-minC)+P,Y=i=>(lr?cross[i]-minC:main[i]-minM)+P;
  const nodes=N.map(n=>({id:n.id,label:n.label,shape:n.shape,lines:n.lines,w:n.w,h:n.h,x:X(n.i),y:Y(n.i)}));
  const dups={};
  const edges=E.map((x,k)=>{
    const e=x.e;
    if(x.f===x.t){const n=nodes[x.f],r=n.x+n.w/2;return{e,d:'M'+uiC(r)+' '+uiC(n.y-6)+'C'+uiC(r+30)+' '+uiC(n.y-24)+' '+uiC(r+30)+' '+uiC(n.y+24)+' '+uiC(r)+' '+uiC(n.y+6),lx:r+34,ly:n.y}}
    const key=Math.min(x.f,x.t)+'-'+Math.max(x.f,x.t);dups[key]=(dups[key]||0)+1;x.k=dups[key]-1;x.key=key;
    return null;
  });
  E.forEach((x,k)=>{
    if(x.f===x.t)return;
    const cnt=dups[x.key],off=(x.k-(cnt-1)/2)*14;
    const ch=chains[k],pts=ch.map((v,j)=>{
      const o=lr?{x:X(v),y:Y(v)}:{x:X(v),y:Y(v)},vv=V[v];
      if(j===0&&!vv.dummy)return lr?{x:o.x+vv.w/2,y:o.y+off}:{x:o.x+off,y:o.y+vv.h/2};
      if(j===ch.length-1&&!vv.dummy)return lr?{x:o.x-vv.w/2,y:o.y+off}:{x:o.x+off,y:o.y-vv.h/2};
      return lr?{x:o.x,y:o.y+off}:{x:o.x+off,y:o.y};
    });
    if(rev.has(k))pts.reverse();
    let d='M'+uiC(pts[0].x)+' '+uiC(pts[0].y);
    for(let j=1;j<pts.length;j++){
      const a=pts[j-1],b=pts[j];
      if(lr){const mx=(a.x+b.x)/2;d+='C'+uiC(mx)+' '+uiC(a.y)+' '+uiC(mx)+' '+uiC(b.y)+' '+uiC(b.x)+' '+uiC(b.y)}
      else{const my=(a.y+b.y)/2;d+='C'+uiC(a.x)+' '+uiC(my)+' '+uiC(b.x)+' '+uiC(my)+' '+uiC(b.x)+' '+uiC(b.y)}
    }
    const mi=Math.floor(pts.length/2),lp=pts.length%2?pts[mi]:{x:(pts[mi-1].x+pts[mi].x)/2,y:(pts[mi-1].y+pts[mi].y)/2};
    edges[k]={e:x.e,d,lx:lp.x,ly:lp.y};
  });
  const W=maxC-minC+2*P,H=maxM-minM+2*P;
  return{nodes,edges,vb:{x:0,y:0,w:Math.ceil(lr?H:W),h:Math.ceil(lr?W:H)}};
}
function uiDgView(v,base,op,fx,fy){ // v/base = {x,y,w,h}; op = 'in' | 'out' | 'reset' | a factor
  if(op==='reset')return Object.assign({},base);
  const k=op==='in'?0.8:op==='out'?1.25:+op||1;
  const w=Math.max(base.w*0.15,Math.min(base.w*4,v.w*k)),kk=w/v.w,px=fx==null?v.x+v.w/2:fx,py=fy==null?v.y+v.h/2:fy;
  return{x:px-(px-v.x)*kk,y:py-(py-v.y)*kk,w,h:v.h*kk};
}
const uiVb=v=>uiC(v.x)+' '+uiC(v.y)+' '+uiC(v.w)+' '+uiC(v.h);
function uiDiagramH(b,key,id){
  const lay=uiDgLayout(b),base=lay.vb,st=uiSt(key,id),v=st.view||base,zm=Math.abs(v.w-base.w)>1||Math.abs(v.x-base.x)>1||Math.abs(v.y-base.y)>1;
  let g='';
  lay.edges.forEach(x=>{
    g+='<path class="ude '+x.e.style+'" d="'+x.d+'"'+(x.e.arrow?' marker-end="url(#uiar)"':'')+'></path>';
  });
  lay.edges.forEach(x=>{
    if(!x.e.label)return;const tw=Math.min(180,x.e.label.length*6.4+10);
    g+='<rect class="udlb" x="'+uiC(x.lx-tw/2)+'" y="'+uiC(x.ly-9)+'" width="'+uiC(tw)+'" height="18" rx="4"></rect><text class="udl" x="'+uiC(x.lx)+'" y="'+uiC(x.ly+4)+'" text-anchor="middle">'+esc(uiCut(x.e.label,28))+'</text>';
  });
  lay.nodes.forEach(n=>{
    const x=n.x,y=n.y,w=n.w,h=n.h;let sh;
    if(n.shape==='diamond')sh='<polygon class="udn" points="'+uiC(x)+','+uiC(y-h/2)+' '+uiC(x+w/2)+','+uiC(y)+' '+uiC(x)+','+uiC(y+h/2)+' '+uiC(x-w/2)+','+uiC(y)+'"></polygon>';
    else if(n.shape==='circle')sh='<ellipse class="udn" cx="'+uiC(x)+'" cy="'+uiC(y)+'" rx="'+uiC(w/2)+'" ry="'+uiC(h/2)+'"></ellipse>';
    else sh='<rect class="udn" x="'+uiC(x-w/2)+'" y="'+uiC(y-h/2)+'" width="'+uiC(w)+'" height="'+uiC(h)+'" rx="'+(n.shape==='round'?uiC(h/2):'8')+'"></rect>';
    const y0=y-(n.lines.length-1)*7.5+4.5;
    g+=sh+'<text class="udt" text-anchor="middle">'+n.lines.map((l,j)=>'<tspan x="'+uiC(x)+'" y="'+uiC(y0+j*15)+'">'+esc(l)+'</tspan>').join('')+'</text>';
  });
  return'<div class="udg'+(zm?' zm':'')+'" data-b="'+id+'" data-base="'+uiVb(base)+'">'+(b.title?'<div class="uct">'+esc(b.title)+'</div>':'')
   +'<svg class="uds" viewBox="'+uiVb(v)+'" preserveAspectRatio="xMidYMid meet" role="img" aria-label="'+ea('diagram, '+b.nodes.length+' nodes')+'"><defs><marker id="uiar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path class="uiah" d="M0 0L10 5L0 10z"></path></marker></defs>'+g+'</svg>'
   +'<div class="udz"><button type="button" data-ua="dz" data-b="'+id+'" data-i="1" aria-label="Zoom in">+</button><button type="button" data-ua="dz" data-b="'+id+'" data-i="2" aria-label="Zoom out">&minus;</button><button type="button" data-ua="dz" data-b="'+id+'" data-i="0" aria-label="Poora diagram dikhao">Fit</button></div></div>';
}
function uiStatH(b){
  if(!b.items.length)return'<div class="uiemp">'+(b.state==='empty'?'Kuch nahi mila':'Load ho raha hai...')+'</div>';
  if(b.state==='loading'||b.state==='skeleton')return'<div class="uist">'+b.items.map(()=>'<div class="uisk"></div>').join('')+'</div>';
  return'<div class="uist">'+b.items.map(it=>{
    let v;
    if(it.type==='badge')v='<span class="uibg '+it.color+'">'+esc(it.v)+'</span>';
    else if(it.type==='status')v='<span class="uidot '+it.color+'"></span>'+esc(it.v);
    else if(it.type==='progress'){const n=Math.max(0,Math.min(it.max,uiNum(it.v,0)));v='<div class="uipb sm"><i style="width:'+(n/it.max*100).toFixed(1)+'%"></i></div><span class="uipn">'+esc(it.v)+'</span>'}
    else v=esc(it.v);
    return'<div class="uistr"><span class="uik">'+esc(it.k)+'</span><span class="uiv">'+v+'</span></div>';
  }).join('')+'</div>';
}
// ---- image: workspace file (read through the native Files plugin) or gen:<id> (in-memory generated image) ----
const UI_IMG=new Map();
function uiImgUrl(src){
  if(src.indexOf('gen:')===0){
    const p=typeof IMG_PV!=='undefined'&&IMG_PV[src.slice(4)];
    return p&&typeof ipUrl==='function'?ipUrl(p):'err';
  }
  const c=UI_IMG.get(src);
  if(typeof c==='string')return c;
  if(c&&(c.wait||Date.now()-c.t<10000))return c.wait?'':'err'; // a failed load is tried again after 10 s
  UI_IMG.set(src,{wait:true,t:Date.now()});
  NF('readB64',{path:src}).then(r=>{
    if(!r||!r.b64||r.b64.length>4000000||!/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(r.mime||''))throw new Error('x');
    UI_IMG.set(src,'data:'+r.mime+';base64,'+r.b64);
  }).catch(()=>UI_IMG.set(src,{t:Date.now()})).then(()=>uiImgRedraw(src));
  return'';
}
function uiImgRedraw(src){
  if(typeof document.querySelectorAll!=='function')return;
  const seen=new Set();
  document.querySelectorAll('.uiimg[data-isrc]').forEach(e=>{if(e.dataset.isrc===src){const w=e.closest('.uiw');if(w&&!seen.has(w)){seen.add(w);uiRefresh(w)}}});
}
// message-level hook used by render(): the widget of a tool message
function uiH(m,hi){
  if(!m.ui)return'';
  if(!uiOn())return'<div class="uierr">Rich UI off hai.</div><div class="code"><pre><code>'+esc(JSON.stringify(m.ui).slice(0,3000))+'</code></pre></div>';
  const r=uiVal(m);
  if(!r.ok)return'<div class="uierr">invalid ui: '+esc(r.err)+'</div>';
  return uiW(r.ui,hi+':0',uiStat(hi+':0'));
}
// ```ui fence inside a normal reply (called by fmt()). Returns {h} (widget) or {err} (fmt then shows the block as code plus this line).
function uiFence(body,closed){
  const k=UI_K++;
  if(!uiOn())return{err:'Rich UI off hai, isliye code ke roop me dikha raha hu.'};
  if(!closed)return{err:'ui block poora nahi aaya (band nahi hua), code ke roop me dikhaya.'};
  const r=uiValStr(body);
  if(!r.ok)return{err:'invalid ui: '+r.err+'. Code ke roop me dikhaya.'};
  const key=UI_HI+':'+k,st=uiStat(key);
  if(st==='old')return{h:'<div class="uiold">Ye widget neeche update ho gaya.</div>'};
  return{h:uiW(r.ui,key,st)};
}

// ---------- taps ----------
function uiFind(key){
  const p=String(key).split(':'),hi=+p[0],k=+p[1],m=H[hi];if(!m)return null;
  const w=uiExtract(m).find(x=>x.k===k);if(!w)return null;
  return{ui:w.ui,ix:uiIndex(w.ui)};
}
const uiFill=(t,v)=>String(t==null?'':t).replace(/\{([A-Za-z0-9_-]{1,32})\}/g,(x,k)=>uiHas(v,k)?v[k]:x);
function uiSendText(t,chip){
  if(busy)return false;
  const i=$('#in'),old=i.value,pend=PEND;
  PEND=[];i.value=t;UI_CHIP=chip||'';
  try{$('#f').dispatchEvent(new Event('submit',{cancelable:true,bubbles:true}))}
  finally{i.value=old;PEND=pend;UI_CHIP=''}
  return true;
}
function uiRun(act,label,el,vars){
  if(!act)return;
  if(act.type==='copy'){
    copyTxt(uiFill(act.value,vars||{})).then(()=>{if(el&&el.isConnected){const o=el.textContent;el.textContent='Copy ho gaya';setTimeout(()=>{if(el.isConnected)el.textContent=o},1400)}});
    return;
  }
  if(act.type!=='send')return;
  const t=uiFill(act.value,vars||{}).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').trim().slice(0,1000);
  if(!t)return;
  uiSendText(t,act.silent?String(label||'').slice(0,40):'');
}
function uiSave(w){ // keep typed values before this widget is redrawn
  const key=w.dataset.ui;
  w.querySelectorAll('[data-uf]').forEach(e=>{
    const k=e.dataset.k,s=uiSt(key,e.dataset.b);
    s.v[k]=e.type==='checkbox'?e.checked:e.value;
  });
}
function uiRefresh(w){
  const key=w.dataset.ui,f=uiFind(key);if(!f)return;
  uiSave(w);w.outerHTML=uiW(f.ui,key,uiStat(key));
}
function uiFormVars(w,b,f,st){
  const vars={},lines=[],js={};let err='';
  for(const fd of f.fields){
    const e=w.querySelector('[data-uf][data-b="'+b+'"][data-k="'+fd.key+'"]');if(!e)continue;
    let v=fd.type==='switch'?(e.checked?'on':'off'):String(e.value).trim();
    if(fd.required&&fd.type!=='switch'&&!v){err='"'+fd.label+'" zaroori hai';break}
    if(fd.type==='number'&&v){const n=parseFloat(v);if(isNaN(n)){err='"'+fd.label+'": number likho';break}if(fd.min!=null&&n<fd.min||fd.max!=null&&n>fd.max){err='"'+fd.label+'": '+(fd.min!=null?fd.min:'')+' se '+(fd.max!=null?fd.max:'')+' ke beech';break}}
    vars[fd.key]=v;lines.push(fd.label+': '+(v===''?'-':v));js[fd.key]=fd.type==='switch'?e.checked:(fd.type==='number'&&v!==''&&!isNaN(parseFloat(v))?parseFloat(v):v);
    st.v[fd.key]=fd.type==='switch'?e.checked:e.value;
  }
  vars.values=lines.join('\n');vars.json=JSON.stringify(js);
  return{vars,err};
}
const uiParseVb=t=>{const a=String(t).trim().split(/\s+/).map(Number);return{x:a[0]||0,y:a[1]||0,w:a[2]||1,h:a[3]||1}};
function uiApplyView(key,bid,c,svg,nv,base){
  svg.setAttribute('viewBox',uiVb(nv));
  const zm=Math.abs(nv.w-base.w)>1||Math.abs(nv.x-base.x)>1||Math.abs(nv.y-base.y)>1;
  uiSt(key,bid).view=zm?nv:null;c.classList.toggle('zm',zm);
}
const UI_G={ptr:new Map(),c:null,svg:null,w:null,base:null,vb0:null,d0:0,mid0:null,ppos:null};
function uiGestureStart(){
  const g=UI_G,pts=[...g.ptr.values()];g.vb0=uiParseVb(g.svg.getAttribute('viewBox'));g.ppos=pts[0]?{x:pts[0].x,y:pts[0].y}:null;
  if(pts.length>=2){g.d0=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y)||1;g.mid0={x:(pts[0].x+pts[1].x)/2,y:(pts[0].y+pts[1].y)/2}}
}
{const ch=$('#chat');if(ch&&ch.addEventListener){
  ch.addEventListener('click',e=>{
    const t=e.target.closest&&e.target.closest('[data-ua]');if(!t||t.disabled)return;
    const w=t.closest('.uiw');if(!w)return;
    const key=w.dataset.ui,live=w.dataset.live==='1',f=uiFind(key);if(!f)return;
    const b=f.ix[+t.dataset.b];if(!b)return;
    const ua=t.dataset.ua,i=+t.dataset.i;
    if(ua==='sort'&&b.type==='table'){
      const s=uiSt(key,b.bid);s.sort=s.sort&&s.sort.c===i?(s.sort.d>0?{c:i,d:-1}:null):{c:i,d:1};uiRefresh(w);return;
    }
    if(ua==='dz'&&b.type==='diagram'){
      const c=t.closest('.udg'),svg=c&&c.querySelector('svg');if(!svg)return;
      const base=uiParseVb(c.dataset.base);uiApplyView(key,b.bid,c,svg,uiDgView(uiParseVb(svg.getAttribute('viewBox')),base,i===1?'in':i===2?'out':'reset'),base);return;
    }
    if(ua==='bdg'&&b.type==='badge'){const it=b.items[i];if(!it||!it.action||(!live&&it.action.type!=='copy'))return;uiRun(it.action,it.label,t);return}
    if(ua==='btn'&&b.type==='buttons'){const it=b.items[i];if(!it||(!live&&it.action.type!=='copy'))return;uiRun(it.action,it.label,t);return}
    if(ua==='play'&&b.type==='html'){uiGOpen(b);return}
    if(!live)return;
    if(ua==='opt'&&b.type==='choice'){
      const s=uiSt(key,b.bid),o=b.options[i];if(!o)return;
      if(b.mode==='multi'){const k=s.sel.indexOf(i);if(k>=0)s.sel.splice(k,1);else s.sel.push(i)}else s.sel=[i];
      if(b.mode==='single'&&!b.submit){uiRun({type:'send',value:'{value}'},o.label,t,{value:o.value,label:o.label,values:o.value,labels:o.label});uiRefresh(w);return}
      uiRefresh(w);return;
    }
    if(ua==='sub'&&b.type==='choice'){
      const s=uiSt(key,b.bid),os=s.sel.map(k=>b.options[k]).filter(Boolean);if(!os.length)return;
      uiRun(b.submit.action,b.submit.label,t,{value:os.map(o=>o.value).join(', '),label:os.map(o=>o.label).join(', '),values:os.map(o=>o.value).join(', '),labels:os.map(o=>o.label).join(', '),json:JSON.stringify(os.map(o=>o.value))});return;
    }
    if(ua==='sub'&&b.type==='form'){
      const s=uiSt(key,b.bid),r=uiFormVars(w,b.bid,b,s),er=w.querySelector('[data-e="'+b.bid+'"]');
      if(er)er.textContent=r.err;if(r.err)return;
      uiRun(b.submit.action,b.submit.label,t,r.vars);
    }
  });
  ch.addEventListener('input',e=>{
    const t=e.target;if(!t||!t.dataset||!t.dataset.uf)return;
    const w=t.closest('.uiw');if(!w)return;
    if(t.type==='range'){const sp=t.parentNode&&t.parentNode.querySelector('.uisv');if(sp)sp.textContent=t.value}
    uiSt(w.dataset.ui,t.dataset.b).v[t.dataset.k]=t.type==='checkbox'?t.checked:t.value;
  });
  // diagram pan/zoom: drag (mouse always; touch only once zoomed, so the chat still scrolls), pinch with two fingers, ctrl+wheel, and the +/-/Fit buttons
  ch.addEventListener('pointerdown',e=>{
    const c=e.target.closest&&e.target.closest('.udg');if(!c||e.target.closest('[data-ua]'))return;
    const w=c.closest('.uiw'),svg=c.querySelector('svg');if(!w||!svg)return;
    const g=UI_G;if(g.c!==c){g.ptr.clear();g.c=c;g.svg=svg;g.w=w;g.base=uiParseVb(c.dataset.base)}
    g.ptr.set(e.pointerId,{x:e.clientX,y:e.clientY,type:e.pointerType});
    try{c.setPointerCapture(e.pointerId)}catch(x){}
    uiGestureStart();
  });
  ch.addEventListener('pointermove',e=>{
    const g=UI_G;if(!g.c||!g.ptr.has(e.pointerId))return;
    g.ptr.set(e.pointerId,{x:e.clientX,y:e.clientY,type:e.pointerType});
    const r=g.svg.getBoundingClientRect(),pts=[...g.ptr.values()],v0=g.vb0;if(!r.width||!r.height)return;
    const sc=Math.max(v0.w/r.width,v0.h/r.height),key=g.w.dataset.ui,bid=+g.c.dataset.b;
    if(pts.length>=2){
      const d=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y)||1,mid={x:(pts[0].x+pts[1].x)/2,y:(pts[0].y+pts[1].y)/2};
      const fx=v0.x+(g.mid0.x-r.left)*sc,fy=v0.y+(g.mid0.y-r.top)*sc,nv=uiDgView(v0,g.base,g.d0/d,fx,fy);
      const sc2=nv.w/r.width;nv.x=fx-(mid.x-r.left)*sc2;nv.y=fy-(mid.y-r.top)*sc2;
      uiApplyView(key,bid,g.c,g.svg,nv,g.base);e.preventDefault();return;
    }
    const p=pts[0];if(!g.ppos||!(e.pointerType==='mouse'||g.c.classList.contains('zm')))return;
    if(e.pointerType==='mouse'&&!(e.buttons&1))return;
    uiApplyView(key,bid,g.c,g.svg,{x:v0.x-(p.x-g.ppos.x)*sc,y:v0.y-(p.y-g.ppos.y)*sc,w:v0.w,h:v0.h},g.base);e.preventDefault();
  });
  const pEnd=e=>{const g=UI_G;g.ptr.delete(e.pointerId);if(g.ptr.size)uiGestureStart();else{g.c=null}};
  ch.addEventListener("pointerup",pEnd);ch.addEventListener("pointercancel",pEnd);
  ch.addEventListener('wheel',e=>{
    const c=e.target.closest&&e.target.closest('.udg');if(!c||!(e.ctrlKey||e.metaKey))return;
    const svg=c.querySelector('svg'),w=c.closest('.uiw');if(!svg||!w)return;
    e.preventDefault();
    const r=svg.getBoundingClientRect(),v=uiParseVb(svg.getAttribute('viewBox')),base=uiParseVb(c.dataset.base),sc=Math.max(v.w/r.width,v.h/r.height);
    uiApplyView(w.dataset.ui,+c.dataset.b,c,svg,uiDgView(v,base,e.deltaY<0?'in':'out',v.x+(e.clientX-r.left)*sc,v.y+(e.clientY-r.top)*sc),base);
  },{passive:false});
  ch.addEventListener('keydown',e=>{
    if((e.key==='Enter'||e.key===' ')&&e.target&&e.target.classList&&e.target.classList.contains('srt')){e.preventDefault();e.target.click()}
  });
}}

// ---------- P3: game panel (sandboxed iframe + one-way bridge) ----------
// Why a panel and not inside the chat: render() rebuilds the whole chat on every message, and an iframe that is moved or rebuilt reloads (the game would restart on each AI reply).
// The panel lives outside #chat, so it survives. The iframe is sandbox="allow-scripts" (no same-origin: it cannot touch the app, its storage, keys, Files/Termux), the CSP blocks all network.
const UIG_CSP="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-src 'none'; object-src 'none'";
const uiGName=p=>String(p||'').split('/').pop().replace(/\.html$/i,'').replace(/[^A-Za-z0-9_-]/g,'').slice(0,24)||'game';
function uiTheme(){
  try{const a=document.documentElement.getAttribute('data-theme');if(a==='dark'||a==='light')return a}catch(e){}
  return'light';
}
// The game file goes AFTER our own head (CSP meta + bridge), as plain content of our body: its own <html>/<head>/<body> tags are merged by the HTML parser,
// so nothing the file contains (comments, a fake <head>, another meta) can come before the CSP.
function uiGameDoc(html,theme){
  theme=theme==='dark'?'dark':'light';
  return'<!doctype html><html data-theme="'+theme+'" style="color-scheme:'+theme+'"><head><meta http-equiv="Content-Security-Policy" content="'+UIG_CSP+'">'
   +'<meta name="viewport" content="width=device-width,initial-scale=1"><script>window.chaman={theme:"'+theme+'",send:function(t){try{parent.postMessage({__chaman:1,t:String(t).slice(0,200)},"*")}catch(e){}}};<\/script></head><body>'
   +String(html)+'</body></html>';
}
async function uiReadText(path){
  const r=await NF('read',{path,start:1,max:1000000,maxBytes:200001}),t=String(r&&r.text||'');
  if(!t.trim())throw new Error('file khaali hai');
  if(t.length>200000||(r.to!=null&&r.lines!=null&&r.to<r.lines))throw new Error('file 200KB se badi hai');
  return t;
}
function uiGPanel(){
  if(UIG.el&&UIG.el.isConnected)return UIG.el;
  const p=document.createElement('div');p.id='uigp';p.hidden=true;
  p.innerHTML='<div class="uigh"><b class="uigt"></b><span class="uigs">sandbox, net band</span><button type="button" class="ib" data-g="re" aria-label="Dobara shuru"><svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg></button><button type="button" class="ib" data-g="x" aria-label="Game band karo"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div><div class="uigb"></div>';
  const pend=$('#pend');pend.parentNode.insertBefore(p,pend);
  p.addEventListener('click',e=>{const t=e.target.closest('[data-g]');if(!t)return;if(t.dataset.g==='x')uiGClose();else uiGRestart()});
  UIG.el=p;return p;
}
async function uiGOpen(b){
  if(!uiOn())return;
  if(UIG.fr&&UIG.src===b.src)return; // already running: a second tap must not restart it
  uiGClose();
  const p=uiGPanel(),tok=++UIG.seq;
  const nm=b.html?uiGName(String(b.title||'demo').replace(/[\/\s]/g,'')):uiGName(b.src);
  Object.assign(UIG,{src:b.src,b:b,name:nm,title:b.title||(b.html?'Demo':nm),n:0,last:0,loads:0,pend:'',html:''});
  p.style.setProperty('--uigh',b.height+'px');p.querySelector('.uigt').textContent=UIG.title;
  p.querySelector('.uigb').innerHTML='<div class="uigm">Game load ho raha hai...</div>';p.hidden=false;
  let html;
  if(b.html)html=b.html;else try{html=await uiReadText(b.src)}catch(e){if(tok===UIG.seq)uiGMsg('Game file nahi padh payi ('+String(e&&e.message||e).slice(0,80)+'). Pehle file_write se banwao.',true);return}
  if(tok!==UIG.seq)return;
  UIG.html=html;uiGMount();
}
function uiGMount(){
  const body=UIG.el.querySelector('.uigb');body.textContent='';
  const f=document.createElement('iframe');
  f.setAttribute('sandbox','allow-scripts');f.setAttribute('referrerpolicy','no-referrer');f.setAttribute('title',UIG.title||'game');
  UIG.loads=0;UIG.n=0;UIG.last=0;
  f.addEventListener('load',()=>{if(UIG.fr!==f)return;UIG.loads++;if(UIG.loads>1)uiGMsg('Game bahar jaane ki koshish kar raha tha, isliye roka. Dobara shuru dabao.',true)});
  f.srcdoc=uiGameDoc(UIG.html,uiTheme());UIG.fr=f;body.appendChild(f);
}
function uiGMsg(msg,kill){
  if(kill&&UIG.fr){try{UIG.fr.remove()}catch(e){}UIG.fr=null}
  if(UIG.el){const body=UIG.el.querySelector('.uigb');body.innerHTML='<div class="uigm uierr"></div>';body.firstChild.textContent=msg}
}
function uiGRestart(){
  if(UIG.fr){try{UIG.fr.remove()}catch(e){}UIG.fr=null}
  if(UIG.html){uiGMount();return}
  if(UIG.b){const b=UIG.b;UIG.src='';uiGOpen(b)}
}
function uiGClose(){
  UIG.seq++;
  if(UIG.fr){try{UIG.fr.remove()}catch(e){}}
  if(UIG.pt){clearInterval(UIG.pt);UIG.pt=0}
  Object.assign(UIG,{fr:null,src:'',b:null,html:'',pend:''});
  if(UIG.el){UIG.el.hidden=true;const body=UIG.el.querySelector('.uigb');if(body)body.textContent=''}
}
// bridge: the game may only say something (200 chars, 1 per 1.5 s, 20 per run). It reaches the AI as "[game:name] text": game code, not Najeef's words.
function uiBridge(e){
  if(!UIG.fr||!uiOn()||e.source!==UIG.fr.contentWindow)return;
  const d=e.data;if(!d||d.__chaman!==1||typeof d.t!=='string')return;
  const t=d.t.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,200);if(!t)return;
  const now=Date.now();
  if(UIG.n>=20||now-UIG.last<1500)return;
  UIG.last=now;UIG.n++;uiGSend(t);
}
function uiGSend(t){
  const msg='[game:'+UIG.name+'] '+t;
  if(uiSendText(msg,t.slice(0,40)))return;
  UIG.pend=t; // the AI is busy: keep the newest event and send it as soon as it is free (max 15 s)
  if(UIG.pt)return;
  let k=0;
  UIG.pt=setInterval(()=>{
    k++;
    if(!UIG.fr||k>30){clearInterval(UIG.pt);UIG.pt=0;UIG.pend='';return}
    if(UIG.pend&&uiSendText('[game:'+UIG.name+'] '+UIG.pend,UIG.pend.slice(0,40))){clearInterval(UIG.pt);UIG.pt=0;UIG.pend=''}
  },500);
}
if(typeof window!=='undefined'&&typeof window.addEventListener==='function')window.addEventListener('message',uiBridge);

// ---------- ui_render tool ----------
TOOLS.push(fn('ui_render','Show an interactive widget in the chat: buttons, choice (MCQ / options), form, table, keyvalue, alert, progress, code, card, text. A tap sends its value back as Najeef\'s next message (a new turn for you). Use it only when tapping beats typing (quiz, options, a form with several fields, a small table); a short answer stays plain text. Widget JSON: {v:1, id, title?, keep?, blocks:[...]}. Call rules_read ui for every block type and the action format, rules_read game for chat games (type html), rules_read diagram for flowcharts (type diagram, nodes+edges or mermaid).',{
  v:{type:'integer',description:'always 1'},
  id:{type:'string',description:'a-z 0-9 and dash, max 32. The same id again replaces the older widget.'},
  title:{type:'string'},
  keep:{type:'boolean',description:'true = the older widget stays tappable when a new one comes. Default false.'},
  blocks:{type:'array',items:{type:'object'},description:'blocks, each has a type: text, card, buttons, choice, form, table, keyvalue, alert, progress, code, divider, spacer'}
},['blocks']));
function uiNote(ui){
  const bits=[];
  const walk=L=>(L||[]).forEach(b=>{
    if(bits.join(' ').length>420)return;
    if(b.type==='text')bits.push(b.md.replace(/\s+/g,' ').slice(0,160));
    else if(b.type==='choice')bits.push('choice['+b.options.map(o=>(o.value!==o.label?o.value+'=':'')+o.label).join(' | ').slice(0,160)+']');
    else if(b.type==='buttons')bits.push('buttons['+b.items.map(i=>i.label).join(' | ').slice(0,120)+']');
    else if(b.type==='form')bits.push('form['+b.fields.map(f=>f.key).join(', ')+']');
    else if(b.type==='table')bits.push('table '+b.rows.length+' rows');
    else if(b.type==='html')bits.push('game '+(b.html?'inline':uiGName(b.src))+' (panel me khulta hai)');
    else if(b.type==='diagram')bits.push('diagram '+b.nodes.length+' nodes: '+b.nodes.slice(0,6).map(n=>n.label).join(', ').slice(0,90));
    else if(b.type==='badge')bits.push('badges['+b.items.map(i=>i.label).join(' | ').slice(0,100)+']');
    else if(b.type==='stat')bits.push('stat '+b.items.length+' items');
    else if(b.type==='card'){walk(b.body);walk(b.footer)}
    else bits.push(b.type);
  });
  walk(ui.blocks);
  return'Widget dikhaya (id '+ui.id+'): '+bits.join(' / ').slice(0,460)+'. Najeef ke tap ka wait; uska jawab agle user message me aayega.';
}
async function uiTool(a,note,fl){
  if(!uiOn()){fl.bad=true;return note('Rich UI band hai. Plain text me jawab do.')}
  const r=uiValidate(a);
  if(!r.ok){fl.bad=true;return note('Widget valid nahi ('+r.err+'). Theek karke dobara bhejo, ya rules_read ui padho.')}
  const ui={v:1,id:r.ui.id,title:r.ui.title,keep:r.ui.keep,blocks:JSON.parse(JSON.stringify(r.ui.blocks,(k,v)=>k==='bid'?undefined:v))};
  const wm={role:'assistant',local:1,content:'',aiNote:uiNote(ui),ui:ui};H.push(wm);uiFresh(wm);
  note('Widget dikhaya: '+ui.id+(r.ui.skipped?' ('+r.ui.skipped+' unknown block skip hua)':''));
  return'Widget "'+ui.id+'" chat me dikh gaya. Najeef ke tap ka wait karo: jawab me ek chhoti line se zyada mat likho aur widget ka text dobara mat likho. Wahi id dobara bhejoge to ye widget replace hoga.';
}
// a turn whose only output was a widget: no empty text bubble, the steps/provider label go on the widget message
function uiMerge(r){
  for(let k=H.length-1;k>=0;k--){
    const m=H[k];if(m.role==='user')break;
    if(m.ui){m.steps=r.steps;m.cards=(r.steps&&r.steps.cards&&r.steps.cards.length?r.steps.cards:undefined);m.by=r.by;return}
  }
  H.push({role:'assistant',content:'(widget)',by:r.by,steps:r.steps,cards:(r.steps&&r.steps.cards&&r.steps.cards.length?r.steps.cards:undefined)});uiFresh(H[H.length-1]);
}
