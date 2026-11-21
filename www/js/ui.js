// 1.38000.0 Rich UI, phase P1: the AI shows a safe, declarative widget in the chat (buttons, choice/MCQ, form, table, key-value, alert, progress, code).
// Two ways in: the ui_render tool, or a ```ui fenced JSON block in the reply (works for chat-only models too). A tap sends a normal user message (a new AI turn).
// Safety: the JSON is never executed. uiValidate() builds a clean copy with only known types and props (unknown type = skipped), every text goes through esc(),
// the DOM carries only indexes (data-b / data-i), the action is looked up again from the stored widget when tapped. No script, no network, no raw HTML.
// Later phases (not here): chart, board, image, html sandbox, diagram, expired hint after reload, Settings switch (uiOn already reads S.ui.off).
const UI_MAX={json:32768,blocks:60,elems:300,depth:5,str:2000,opts:20,fields:20,rows:100,cols:12,items:12,kv:50};
let UI_HI=-1,UI_K=0,UI_CHIP='',UI_INFO={},UI_N=0;
const UI_ST={},UI_CACHE=new WeakMap(),UI_SCACHE=new Map(),UI_IDX=new WeakMap();
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
    case'buttons':{
      uiCount(cx);const items=[];
      for(const it of(Array.isArray(b.items)?b.items.slice(0,UI_MAX.items):[])){
        if(!it||typeof it!=='object')continue;const label=uiStr(it.label,80,'button label').trim();if(!label)continue;
        uiCount(cx);items.push({label,style:['primary','secondary','danger'].includes(it.style)?it.style:'secondary',action:uiAction(it.action)});
      }
      if(!items.length){cx.n--;cx.skip++;return null}
      o={type:T,items};break;
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
  H.forEach((m,hi)=>{if(m.role==='user')lastUser=hi;uiExtract(m).forEach(w=>L.push({hi,k:w.k,id:w.ui.id,keep:w.ui.keep}))});
  const info={};
  L.forEach((w,i)=>{
    const later=L.slice(i+1).some(x=>x.id===w.id),isLast=i===L.length-1;
    info[w.hi+':'+w.k]=later?'old':(w.keep||(isLast&&w.hi>lastUser))?'live':'frozen';
  });
  UI_INFO=info;
}
function uiCtx(hi){UI_HI=hi;UI_K=0;return''}
const uiHide=(m,hi)=>!!(m&&m.ui&&UI_INFO[hi+':0']==='old');
const uiStat=key=>UI_INFO[key]||'frozen';

// ---------- renderer: clean widget -> HTML string (every text escaped) ----------
const uiSt=(key,bid)=>UI_ST[key+'|'+bid]||(UI_ST[key+'|'+bid]={sel:[],v:{},sort:null});
function uiW(ui,key,st){
  uiIndex(ui);const live=st==='live';
  return'<div class="uiw'+(live?'':' frz')+'" data-ui="'+ea(key)+'" data-live="'+(live?1:0)+'">'+(ui.title?'<div class="uit">'+esc(ui.title)+'</div>':'')+ui.blocks.map(b=>uiB(b,key,live)).join('')+'</div>';
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
    case'divider':return'<hr>';
    case'spacer':return'<div class="uisp"></div>';
  }
  return'';
}
const dis0=live=>live?'':' disabled';
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
  const vars={},lines=[];let err='';
  for(const fd of f.fields){
    const e=w.querySelector('[data-uf][data-b="'+b+'"][data-k="'+fd.key+'"]');if(!e)continue;
    let v=fd.type==='switch'?(e.checked?'on':'off'):String(e.value).trim();
    if(fd.required&&fd.type!=='switch'&&!v){err='"'+fd.label+'" zaroori hai';break}
    if(fd.type==='number'&&v){const n=parseFloat(v);if(isNaN(n)){err='"'+fd.label+'": number likho';break}if(fd.min!=null&&n<fd.min||fd.max!=null&&n>fd.max){err='"'+fd.label+'": '+(fd.min!=null?fd.min:'')+' se '+(fd.max!=null?fd.max:'')+' ke beech';break}}
    vars[fd.key]=v;lines.push(fd.label+': '+(v===''?'-':v));
    st.v[fd.key]=fd.type==='switch'?e.checked:e.value;
  }
  vars.values=lines.join('\n');
  return{vars,err};
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
    if(ua==='btn'&&b.type==='buttons'){const it=b.items[i];if(!it||(!live&&it.action.type!=='copy'))return;uiRun(it.action,it.label,t);return}
    if(!live)return;
    if(ua==='opt'&&b.type==='choice'){
      const s=uiSt(key,b.bid),o=b.options[i];if(!o)return;
      if(b.mode==='multi'){const k=s.sel.indexOf(i);if(k>=0)s.sel.splice(k,1);else s.sel.push(i)}else s.sel=[i];
      if(b.mode==='single'&&!b.submit){uiRun({type:'send',value:'{value}'},o.label,t,{value:o.value,label:o.label,values:o.value,labels:o.label});uiRefresh(w);return}
      uiRefresh(w);return;
    }
    if(ua==='sub'&&b.type==='choice'){
      const s=uiSt(key,b.bid),os=s.sel.map(k=>b.options[k]).filter(Boolean);if(!os.length)return;
      uiRun(b.submit.action,b.submit.label,t,{value:os.map(o=>o.value).join(', '),label:os.map(o=>o.label).join(', '),values:os.map(o=>o.value).join(', '),labels:os.map(o=>o.label).join(', ')});return;
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
  ch.addEventListener('keydown',e=>{
    if((e.key==='Enter'||e.key===' ')&&e.target&&e.target.classList&&e.target.classList.contains('srt')){e.preventDefault();e.target.click()}
  });
}}

// ---------- ui_render tool ----------
TOOLS.push(fn('ui_render','Show an interactive widget in the chat: buttons, choice (MCQ / options), form, table, keyvalue, alert, progress, code, card, text. A tap sends its value back as Najeef\'s next message (a new turn for you). Use it only when tapping beats typing (quiz, options, a form with several fields, a small table); a short answer stays plain text. Widget JSON: {v:1, id, title?, keep?, blocks:[...]}. Call rules_read ui for every block type and the action format.',{
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
  H.push({role:'assistant',local:1,content:'',aiNote:uiNote(ui),ui:ui});
  note('Widget dikhaya: '+ui.id+(r.ui.skipped?' ('+r.ui.skipped+' unknown block skip hua)':''));
  return'Widget "'+ui.id+'" chat me dikh gaya. Najeef ke tap ka wait karo: jawab me ek chhoti line se zyada mat likho aur widget ka text dobara mat likho. Wahi id dobara bhejoge to ye widget replace hoga.';
}
// a turn whose only output was a widget: no empty text bubble, the steps/provider label go on the widget message
function uiMerge(r){
  for(let k=H.length-1;k>=0;k--){
    const m=H[k];if(m.role==='user')break;
    if(m.ui){m.steps=r.steps;m.by=r.by;return}
  }
  H.push({role:'assistant',content:'(widget)',by:r.by,steps:r.steps});
}
