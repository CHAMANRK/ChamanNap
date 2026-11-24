// U2 (1.43000.0): developer components. Tool cards (live + history), terminal view, log viewer.
// These only SHOW and RECORD work. The tools, the AI text and the overlay status line work as before.
// - m.steps (plain strings) stays: the AI still reads it (providers.js stepsNote). m.cards is the structured copy for the UI.
// - A card: {n:tool, k:kind, l:label, g:target, s:run|ok|fail, t0, t:ms, r:result, nt:[notes], i,j: range of m.steps it wrote}
const TC_MAX=40,TC_NOTES=6,TC_NOTE_LEN=200;
const tcCut=(s,n)=>{s=String(s==null?'':s).replace(/\s+/g,' ').trim();return s.length>n?s.slice(0,n-3)+'...':s};
function tcFmt(ms){
  if(!(ms>=0))return'';
  if(ms<1000)return Math.round(ms)+'ms';
  const s=ms/1000;
  if(s<10)return s.toFixed(1)+'s';
  if(s<60)return Math.round(s)+'s';
  return Math.floor(s/60)+'m '+Math.round(s%60)+'s';
}
function tcKind(name){
  name=String(name||'');
  if(name==='termux_run'||name==='run_code'||name==='run_flow')return'term';
  if(/^(file_|termux_(write|read)_file|edit_file)/.test(name))return'file';
  if(/^(open_url|open_intent|open_app)$/.test(name))return'web';
  if(/^(memory_|note_|rule_|rules_)/.test(name))return'mem';
  if(name==='generate_image')return'img';
  if(name==='ui_render')return'ui';
  if(/^(screen_|device_api|api_check|call|send_sms|read_sms|torch|set_|notify_|tap_when|who_is|ask_user|wait_for)/.test(name))return'phone';
  return'gear';
}
// target = what the tool works on, short. Never typed text, SMS text or file content.
function tcTarget(name,a){
  a=a||{};
  let t='';
  try{
    switch(name){
      case'termux_run':t=String(a.command||'').split('\n').map(x=>x.trim()).filter(Boolean).map(x=>x.replace(/^cd\s+\S+\s*(&&|;)\s*/,'')).filter(Boolean)[0]||'';break;
      case'file_write':case'file_read':case'edit_file':case'file_delete':case'file_mkdir':case'file_list':case'file_present':case'file_search':case'file_move':case'termux_write_file':case'termux_read_file':t=a.path||a.from||'';break;
      case'open_url':t=String(a.uri||'').replace(/^https?:\/\//,'').split(/[?#]/)[0];break;
      case'run_code':{const l=String(a.code||'').split('\n').map(x=>x.trim()).filter(x=>x&&!/^(\/\/|#|--)\s*$/.test(x))[0]||'';t=(a.lang?a.lang+': ':'')+l;break}
      case'open_app':case'open_intent':case'device_api':t=String(a.name||'').replace(/_/g,' ');break;
    }
  }catch(e){t=''}
  if(typeof logClean==='function')t=logClean(t);
  return tcCut(t,70);
}
// AI writes one short line per tool call (card title). Added to a COPY of the tool list at send time; execTool strips it before the tool runs.
const TC_WHY={type:'string',description:'Max 10 words, Hinglish: abhi kya kar rahe ho (jaise "gsm folder me git status dekh raha hu"). Koi secret, password ya OTP mat likho.'};
function tcWhyTools(t){
  try{
    return t.map(x=>{
      const f=x&&x.function;if(!f||!f.parameters||!f.parameters.properties||f.parameters.properties.why)return x;
      const ps=Object.assign({},f.parameters.properties,{why:TC_WHY});
      const rq=(f.parameters.required||[]).concat('why');
      return Object.assign({},x,{function:Object.assign({},f,{parameters:Object.assign({},f.parameters,{properties:ps,required:rq})})});
    });
  }catch(e){return t}
}
let TC_CUR=null;   // card of the tool running right now (execTool runs tools one by one)
// full command / code for the card body (tap). Same text the terminal block already shows in chat. Capped, total per turn capped too.
const TC_FC=1200,TC_FCT=8000;
function tcFull(steps,name,a){
  let t='';
  if(name==='termux_run')t=String(a&&a.command||'');
  else if(name==='run_code')t=(a&&a.lang?'['+a.lang+']\n':'')+String(a&&a.code||'');
  if(!t)return'';
  if(typeof logClean==='function')t=logClean(t);
  steps.fcb=steps.fcb||0;
  const room=Math.min(TC_FC,TC_FCT-steps.fcb);
  if(room<=0)return'';
  const o=t.length>room?t.slice(0,room)+'\n... ('+(t.length-room)+' char aur)':t;
  steps.fcb+=o.length;
  return o;
}
function tcBegin(steps,name,a,why){
  TC_CUR=null;
  try{
    if(!steps)return null;
    if(!steps.cards)steps.cards=[];
    if(steps.cards.length>=TC_MAX)return null;
    const c={n:name,k:tcKind(name),l:(typeof lnLabel==='function'?lnLabel(name,a):String(name)),w:tcCut(why,70),g:tcTarget(name,a),fc:tcFull(steps,name,a),s:'run',t0:Date.now(),t:0,r:'',nt:[],i:steps.length,j:steps.length};
    steps.cards.push(c);
    TC_CUR=c;
    return c;
  }catch(e){return null}
}
function tcEnd(c,steps,name,a,bad,res,note){
  try{
    if(!c)return;
    if(TC_CUR===c)TC_CUR=null;
    c.s=bad?'fail':'ok';c.t=Math.max(0,Date.now()-c.t0);c.t0=0;
    c.r=typeof lnResult==='function'?lnResult(name,a,bad,res,note):'';
    c.j=steps.length;
    c.nt=steps.slice(c.i,c.j).slice(0,TC_NOTES).map(x=>tcCut(x,TC_NOTE_LEN));
  }catch(e){}
}
const TC_ICO={
  term:'<path d="M4 7l5 5-5 5M12 18h8"/>',
  file:'<path d="M7 3h7l5 5v13H7zM14 3v5h5"/>',
  web:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  mem:'<path d="M5 5h14v14H5zM9 9h6M9 13h6"/>',
  phone:'<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>',
  img:'<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M4 18l5-5 4 4 3-3 4 4"/>',
  ui:'<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 9h16M9 9v11"/>',
  gear:'<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>'
};
const tcSvg=(p,cls)=>'<svg class="'+(cls||'tci')+'" viewBox="0 0 24 24" aria-hidden="true">'+p+'</svg>';
const TC_CHEV='<svg class="tck" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
function tcStat(s){
  if(s==='run')return'<span class="tcs spin" role="img" aria-label="chal raha hai"></span>';
  return'<svg class="tcs '+s+'" viewBox="0 0 24 24" role="img" aria-label="'+(s==='ok'?'ho gaya':'fail')+'">'+(s==='ok'?'<path d="M5 12.5l4.5 4.5L19 7.5"/>':'<path d="M6 6l12 12M18 6L6 18"/>')+'</svg>';
}
function tcRow(c,ci){
  const st=c.s||'ok',run=st==='run',open=!!c.x||(ci!=null&&run);
  const tm=run?tcFmt(Date.now()-(c.t0||Date.now())):tcFmt(c.t);
  let body='';
  const dsum=c.df&&c.df.length?dfStat(c.df.reduce((x,f)=>x+f.a,0),c.df.reduce((x,f)=>x+f.d,0)):'';
  if(c.df&&c.df.length)body+='<div class="dfs-list">'+c.df.map(dfHtml).join('')+'</div>';
  if(c.fc)body+='<pre class="tcc">'+esc(c.fc)+'</pre>';
  if(c.r&&!run)body+='<div class="tcr">'+esc(c.r)+'</div>';
  (c.nt||[]).forEach(x=>{body+='<div class="tcn">'+esc(x)+'</div>'});
  if(run)body+='<div class="tcr">Chal raha hai...</div>';
  if(!body)body='<div class="tcr">Koi detail nahi.</div>';
  return'<div class="tc '+st+(open?' open':'')+'" role="listitem"'+(ci!=null?' data-ci="'+ci+'"':'')+'>'
    +'<button type="button" class="tch" aria-expanded="'+(open?'true':'false')+'">'
    +tcSvg(TC_ICO[c.k]||TC_ICO.gear)
    +'<span class="tcm"><span class="tcl">'+esc(c.w||c.l||c.n)+'</span>'+(c.g?'<span class="tcg">'+esc(c.g)+'</span>':'')+'</span>'
    +dsum+tcStat(st)+'<span class="tce'+(run?' tcel':'')+'"'+(run?' data-t0="'+(c.t0||0)+'"':'')+'>'+esc(tm)+'</span>'+TC_CHEV+'</button>'
    +'<div class="tcb">'+body+'</div></div>';
}
// 3+ cards of one turn collapse into one summary row (tap = open). Live: the running card (or the last one) stays visible under it.
const TC_GROUP=3;
function tcSumRow(cs,open,live){
  let ok=0,fail=0,run=0;
  cs.forEach(c=>{if(c.s==='run')run++;else if(c.s==='fail')fail++;else ok++});
  const p=[cs.length+' kaam'];
  if(live){if(ok)p.push(ok+' ho gaye');if(run)p.push(run+' chal raha')}else if(ok)p.push(ok+' ok');
  if(fail)p.push(fail+' fail');
  const st=fail?'fail':run?'run':'ok';
  return'<button type="button" class="tcsum '+st+'" aria-expanded="'+(open?'true':'false')+'">'
    +tcSvg('<path d="M4 7h16M4 12h16M4 17h16"/>')+'<span class="tcsl">'+esc(p.join(' · '))+'</span>'+tcStat(st)+TC_CHEV+'</button>';
}
// finished message: the cards, then any step lines no card owns (rare app notes)
function cardsH(m,hi){
  // a card still 'run' in history = the app stopped before it ended: show it as failed, not as running forever
  const cs=(m.cards||[]).map(c=>c.s==='run'?Object.assign({},c,{s:'fail',t:-1,x:0,r:'ruk gaya, result nahi aaya'}):Object.assign({},c,{x:0}));
  const rows='<div class="tcs-list tcfull" role="list">'+cs.map(c=>tcRow(c,null)).join('')+'</div>';
  let h=(cs.length>=TC_GROUP?'<div class="tcgrp'+(m.gx?' open':'')+'" data-hi="'+hi+'">'+tcSumRow(cs,!!m.gx,false)+rows+'</div>':rows)+dfReviewH(m,hi);
  const own={};cs.forEach(c=>{for(let i=c.i;i<(c.j==null?c.i:c.j);i++)own[i]=1});
  const ex=(m.steps||[]).filter((s,i)=>!own[i]).slice(-6);
  if(ex.length)h+='<div class="steps">'+ex.map(esc).join('<br>')+'</div>';
  return h;
}
function tcLive(){
  try{return(typeof TURN!=='undefined'&&TURN&&TURN.steps&&TURN.steps.cards)||[]}catch(e){return[]}
}
// the running turn (inside the status row): every tool of this turn, the running one open
function tcLiveH(){
  const cs=tcLive();
  if(!cs.length)return'';
  const from=Math.max(0,cs.length-8),grp=cs.length>=TC_GROUP,open=!grp||!!LN.gx;
  let h='<div class="tcs-list live tcfull" role="list">';
  if(from>0)h+='<div class="tcmore">+'+from+' pehle ke kaam ho chuke</div>';
  for(let i=from;i<cs.length;i++)h+=tcRow(cs[i],i);
  h+='</div>';
  if(!grp)return h;
  let pk=cs.length-1;
  for(let i=cs.length-1;i>=0;i--)if(cs[i].s==='run'){pk=i;break}
  return'<div class="tcgrp'+(open?' open':'')+'" data-live="1">'+tcSumRow(cs,open,true)+h+'<div class="tcs-list live tcpeek" role="list">'+tcRow(cs[pk],pk)+'</div></div>';
}
function tcTick(){
  try{
    if(typeof document.querySelectorAll!=='function')return;
    document.querySelectorAll('#ty .tcel,#chat .tcel').forEach(el=>{
      const t0=+el.getAttribute('data-t0');if(t0)el.textContent=tcFmt(Date.now()-t0);
    });
  }catch(e){}
}

// ---------- terminal view ----------
const TR_ERR=/\b(error|failed|failure|denied|not found|no such file|cannot|can't|traceback|exception|fatal|segmentation|unable to)\b/i;
const TR_WARN=/\b(warn(ing)?|deprecated)\b/i;
function trLines(out,failed){
  const L=String(out==null?'':out).split('\n');
  let skip=0;
  if(L.length>400){skip=L.length-400;L.splice(0,skip)}
  let inErr=false;
  const h=L.map(l=>{
    if(/^\[(stderr|termux)\]/.test(l)){inErr=true;return'<span class="lm">'+esc(l)+'</span>'}
    const cls=TR_WARN.test(l)&&!TR_ERR.test(l)?'lw':(inErr||(failed&&TR_ERR.test(l)))?'le':'';
    return cls?'<span class="'+cls+'">'+esc(l)+'</span>':esc(l);
  }).join('\n');
  return(skip?'<span class="lm">... '+skip+' lines upar chhod di</span>\n':'')+h;
}
function trText(t){
  t=t||{};
  return(t.lang?'['+t.lang+']\n'+String(t.code||'')+'\n\n':'$ '+String(t.cmd||'')+'\n')+String(t.out==null?'':t.out)+(t.code!=null&&!t.lang?'\n[exit '+t.code+']':'');
}
function termH(t,hi){
  t=t||{};
  let st=t.state||'ok';
  const live=typeof busy!=='undefined'&&busy;
  if(st==='run'&&!live)st='fail';
  const isCode=!!t.lang,exit=!isCode&&t.code!=null?t.code:null;
  let badge;
  if(st==='run')badge='<span class="trb run"><span class="tcel" data-t0="'+(t.t0||0)+'">'+tcFmt(Date.now()-(t.t0||Date.now()))+'</span></span>';
  else if(exit!=null)badge='<span class="trb '+(exit===0?'ok':'fail')+'">exit '+esc(String(exit))+'</span>';
  else badge='<span class="trb '+(st==='ok'?'ok':'fail')+'">'+(st==='ok'?'ok':(t.state==='run'?'ruk gaya':'error'))+'</span>';
  const out=String(t.out==null?'':t.out),n=out?out.split('\n').length:0;
  let h='<div class="trm '+st+'"><div class="trh"><span class="trd"></span><span class="trt">'+esc(isCode?t.lang:'Terminal')+'</span>'+badge
    +'<button type="button" class="trc" data-hi="'+(hi==null?'':hi)+'" aria-label="Output copy karo">'+(typeof ICO_COPY!=='undefined'?ICO_COPY:'Copy')+'</button></div>';
  if(isCode)h+='<pre class="trcode">'+esc(String(t.code||''))+'</pre>';
  else h+='<div class="trp"><span class="pr">$</span><span class="cmd">'+esc(String(t.cmd||''))+'</span></div>';
  if(st==='run')h+='<div class="trw"><span class="tcs spin" aria-hidden="true"></span>Chal raha hai...</div>';
  else if(out)h+='<pre class="tro">'+trLines(out,st==='fail')+'</pre>'+(n>12?'<button type="button" class="trx" aria-expanded="false">Poora dikhao ('+n+' lines)</button>':'');
  else if(t.err)h+='<pre class="tro"><span class="le">'+esc(String(t.err))+'</span></pre>';
  else h+='<div class="trw">(koi output nahi)</div>';
  return h+'</div>';
}

// clicks inside the chat: open/close a card, copy terminal output, show all lines
if(typeof document.addEventListener==='function'&&$('#chat')&&$('#chat').addEventListener){
  $('#chat').addEventListener('click',e=>{
    const T=e.target&&e.target.closest?e.target:null;if(!T)return;
    const sm=T.closest('.tcsum');
    if(sm){
      const g=sm.parentNode,o=g.classList.toggle('open');sm.setAttribute('aria-expanded',o?'true':'false');
      if(g.hasAttribute('data-live'))LN.gx=o;
      else{const m=H[+g.getAttribute('data-hi')];if(m)m.gx=o?1:0}
      return;
    }
    const h=T.closest('.tch');
    if(h){
      const c=h.parentNode,o=c.classList.toggle('open');h.setAttribute('aria-expanded',o?'true':'false');
      const ci=c.getAttribute('data-ci');
      if(ci!==null&&ci!==''){const L=tcLive()[+ci];if(L)L.x=o?1:0}
      return;
    }
    const rv=T.closest('.rvb');
    if(rv){const m=H[+rv.getAttribute('data-hi')];if(m)dfvOpen(m);return}
    const cp=T.closest('.trc');
    if(cp){
      const m=H[+cp.getAttribute('data-hi')];
      if(m&&m.term)copyTxt(trText(m.term)).then(()=>{const o=cp.innerHTML;cp.innerHTML=typeof ICO_OK!=='undefined'?ICO_OK:'ok';setTimeout(()=>{cp.innerHTML=o},1200)});
      return;
    }
    const x=T.closest('.trx');
    if(x){
      const b=x.parentNode.classList.toggle('big');x.setAttribute('aria-expanded',b?'true':'false');
      const n=(x.textContent.match(/\((\d+) lines\)/)||[])[1];
      x.textContent=b?'Chhota karo':'Poora dikhao ('+n+' lines)';
    }
  });
}

// ---------- log viewer ----------
var LGV={open:false,f:'all',q:'',follow:true,n:-1,timer:0,old:false};
const lgLvl=e=>{const s=e.k+' '+e.x;return/\bFAIL\b|\b(error|fail(ed)?|timeout|exception)\b|exit [1-9]/i.test(s)?'err':/\b(warn|expired|cancel|retry|limit|stop)/i.test(s)?'warn':'info'};
const lgPad=n=>String(n).padStart(2,'0');
const lgTime=t=>{const d=new Date(t);return lgPad(d.getHours())+':'+lgPad(d.getMinutes())+':'+lgPad(d.getSeconds())};
function lgList(){
  const q=LGV.q.trim().toLowerCase(),f=LGV.f;
  return(typeof LOGV!=='undefined'?LOGV:[]).filter(e=>{
    const lv=lgLvl(e);
    if(f==='err'&&lv!=='err')return false;
    if(f==='warn'&&lv!=='warn')return false;
    if(f==='tool'&&e.k.indexOf('tool')!==0)return false;
    if(f==='termux'&&e.k!=='termux')return false;
    return!q||(e.k+' '+e.x+' '+(e.c||'')).toLowerCase().indexOf(q)>=0;
  });
}
function lgvDraw(){
  const box=$('#lgl');if(!box)return;
  const all=typeof LOGV!=='undefined'?LOGV:[],L=lgList();
  LGV.n=all.length;
  const off=S&&S.lg&&S.lg.on===false;
  let h='';
  if(off)h+='<div class="lgn">Log save Off hai, isliye naye logs nahi ban rahe. Settings > Logs me On karo.</div>';
  if(!LGV.old&&typeof logToday==='function')h+='<button type="button" class="btn ghost lgold" id="lgold">Purane logs file se lao</button>';
  if(!L.length)h+='<div class="lgn">'+(all.length?'Is filter me kuch nahi mila.':'Abhi koi log nahi.')+'</div>';
  h+=L.map(e=>{
    const lv=lgLvl(e),more=e.x.length>90||!!e.c;
    return'<div class="lge '+lv+(e.o?' open':'')+'"><button type="button" class="lgr" data-g="'+all.indexOf(e)+'"'+(more?'':' tabindex="-1"')+' aria-expanded="'+(e.o?'true':'false')+'"><span class="lgt">'+lgTime(e.t)+'</span><span class="lgk">'+esc(e.k)+'</span><span class="lgm">'+esc(e.x)+'</span></button>'+(e.c?'<pre class="lgc">'+esc(e.c)+'</pre>':'')+'</div>';
  }).join('');
  box.innerHTML=h;
  if(LGV.follow)box.scrollTop=box.scrollHeight;
  const cnt=$('#lgcnt');if(cnt)cnt.textContent=L.length+' / '+all.length;
  document.querySelectorAll('#lgv .lgchip').forEach(b=>{const on=b.getAttribute('data-f')===LGV.f;b.classList.toggle('on',on);b.setAttribute('aria-pressed',on?'true':'false')});
  const fb=$('#lgvf');if(fb)fb.setAttribute('aria-pressed',LGV.follow?'true':'false');
}
function lgvTick(){
  if(!LGV.open)return;
  const all=typeof LOGV!=='undefined'?LOGV:[];
  if(all.length!==LGV.n)lgvDraw();
}
function lgvOpen(){
  const v=$('#lgv');if(!v)return;
  LGV.open=true;LGV.follow=true;v.classList.add('open');lgvDraw();
  if(LGV.timer)clearInterval(LGV.timer);
  LGV.timer=setInterval(lgvTick,1000);
}
function lgvClose(){
  const v=$('#lgv');LGV.open=false;if(v)v.classList.remove('open');
  if(LGV.timer){clearInterval(LGV.timer);LGV.timer=0}
}
// "- [YYYY-MM-DD ]HH:MM:SS [kind] text" + optional ```code``` block, as log.js writes them
function lgParse(txt){
  const out=[],L=String(txt||'').split('\n');
  const re=/^- (?:(\d{4}-\d\d-\d\d) )?(\d\d):(\d\d):(\d\d) \[([^\]]*)\] (.*)$/;
  let cur=null,inCode=false;
  const today=new Date();
  L.forEach(l=>{
    const m=re.exec(l);
    if(!inCode&&m){
      const d=m[1]?m[1].split('-').map(Number):[today.getFullYear(),today.getMonth()+1,today.getDate()];
      cur={t:new Date(d[0],d[1]-1,d[2],+m[2],+m[3],+m[4]).getTime(),k:m[5],x:m[6],c:'',old:1};
      out.push(cur);return;
    }
    if(cur&&l==='```'){inCode=!inCode;return}
    if(cur&&inCode)cur.c+=(cur.c?'\n':'')+l;
  });
  return out;
}
(function lgvInit(){
  if(!$('#lgv')||typeof document.addEventListener!=='function')return;
  $('#lgvx').onclick=lgvClose;
  $('#lgvc').onclick=()=>{
    const t=lgList().map(e=>lgTime(e.t)+' ['+e.k+'] '+e.x+(e.c?'\n'+e.c:'')).join('\n');
    copyTxt(t||'(khaali)').then(()=>{const b=$('#lgvc'),o=b.innerHTML;b.innerHTML=typeof ICO_OK!=='undefined'?ICO_OK:'ok';setTimeout(()=>{b.innerHTML=o},1200)});
  };
  $('#lgvf').onclick=()=>{LGV.follow=!LGV.follow;if(LGV.follow){const b=$('#lgl');b.scrollTop=b.scrollHeight}lgvDraw()};
  $('#lgq').oninput=()=>{LGV.q=$('#lgq').value;lgvDraw()};
  $('#lgv').addEventListener('click',e=>{
    const T=e.target;if(!T||!T.closest)return;
    const ch=T.closest('.lgchip');
    if(ch){LGV.f=ch.getAttribute('data-f');lgvDraw();return}
    const r=T.closest('.lgr');
    if(r){
      const e2=LOGV[+r.getAttribute('data-g')];
      if(e2){e2.o=!e2.o;const sc=$('#lgl').scrollTop;lgvDraw();$('#lgl').scrollTop=sc}
      return;
    }
    if(T.closest('#lgold')){
      const b=T.closest('#lgold');b.disabled=true;b.textContent='Padh raha hu...';
      logToday().then(txt=>{
        const first=LOGV.length?LOGV[0].t:Infinity;
        const old=lgParse(txt).filter(x=>x.t<first);
        LOGV.unshift(...old);while(LOGV.length>800)LOGV.shift();
        LGV.old=true;LGV.follow=false;lgvDraw();
      }).catch(er=>{LGV.old=true;lgvDraw();const n=$('#lgl');n.insertAdjacentHTML('afterbegin','<div class="lgn">'+esc(typeof termuxMsg==='function'&&termuxMsg(er&&er.code)||(typeof errMsg==='function'?errMsg(er):'error'))+'</div>')});
    }
  });
  $('#lgl').addEventListener('scroll',()=>{
    const b=$('#lgl'),near=b.scrollHeight-b.scrollTop-b.clientHeight<40;
    if(LGV.follow&&!near){LGV.follow=false;const fb=$('#lgvf');if(fb)fb.setAttribute('aria-pressed','false')}
  });
})();

// ---------- U3 (1.44000.0): diff viewer + review bar ----------
// A diff is recorded by files.js (file_write / edit_file) on the card of that tool: card.df=[{p,k,a,d,h,om}]
//   p=path, k=edit|write|new, a/d=real counts of added/removed lines, h=hunks [{h:'@@..@@',l:[[+|-|' ',lineNo,text]]}], om=changed lines not stored
// Stored small (max 60 lines per file, 8 files per message). It shows what chat already showed as text (fDiff), nothing new.
const DF_MAXL=60,DF_LINE=140,DF_FILES=8;
const dfCut=(s,n)=>s.length>n?s.slice(0,n-3)+'...':s;
const dfSplit=t=>String(t==null?'':t).replace(/\r\n/g,'\n').split('\n');
// line diff old -> new. base: number of the first line (default 1; 0 = line numbers unknown, hide them)
function dfText(oldT,newT,ctx,base){
  ctx=ctx==null?3:ctx;const B0=base===undefined?1:base;
  const A=dfSplit(oldT),B=dfSplit(newT);
  let s=0;while(s<A.length&&s<B.length&&A[s]===B[s])s++;
  let ea=A.length,eb=B.length;while(ea>s&&eb>s&&A[ea-1]===B[eb-1]){ea--;eb--}
  const a=A.slice(s,ea),b=B.slice(s,eb),mid=[];
  if(a.length*b.length<=160000){
    const n=a.length,m=b.length,w=m+1,T=new Uint16Array((n+1)*w);
    for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)T[i*w+j]=a[i]===b[j]?T[(i+1)*w+j+1]+1:Math.max(T[(i+1)*w+j],T[i*w+j+1]);
    let i=0,j=0;
    while(i<n||j<m){
      if(i<n&&j<m&&a[i]===b[j]){mid.push([' ',a[i],s+i,s+j]);i++;j++}
      else if(i<n&&(j>=m||T[(i+1)*w+j]>=T[i*w+j+1])){mid.push(['-',a[i],s+i,null]);i++}   // on a tie the removal comes first, like a normal diff
      else{mid.push(['+',b[j],null,s+j]);j++}
    }
  }else{a.forEach((x,i)=>mid.push(['-',x,s+i,null]));b.forEach((x,j)=>mid.push(['+',x,null,s+j]))}
  let ad=0,dl=0;mid.forEach(e=>{if(e[0]==='+')ad++;else if(e[0]==='-')dl++});
  if(!ad&&!dl)return{a:0,d:0,h:[]};
  const seq=[];
  for(let i=Math.max(0,s-ctx);i<s;i++)seq.push([' ',A[i],i,i]);
  mid.forEach(e=>seq.push(e));
  for(let k=0;k<ctx&&ea+k<A.length;k++)seq.push([' ',A[ea+k],ea+k,eb+k]);
  const keep=new Array(seq.length).fill(false);
  seq.forEach((e,i)=>{if(e[0]!==' ')for(let k=Math.max(0,i-ctx);k<=Math.min(seq.length-1,i+ctx);k++)keep[k]=true});
  const no=i=>B0?B0+i:0,hunks=[];
  for(let i=0;i<seq.length;){
    if(!keep[i]){i++;continue}
    let j=i;while(j<seq.length&&keep[j])j++;
    const part=seq.slice(i,j);
    const o1=part.find(e=>e[2]!=null),n1=part.find(e=>e[3]!=null);
    const oc=part.filter(e=>e[0]!=='+').length,nc=part.filter(e=>e[0]!=='-').length;
    hunks.push({h:B0?'@@ -'+(o1?no(o1[2]):0)+','+oc+' +'+(n1?no(n1[3]):0)+','+nc+' @@':'',l:part.map(e=>[e[0],e[0]==='-'?(e[2]==null?0:no(e[2])):(e[3]==null?0:no(e[3])),dfCut(e[1],DF_LINE)])});
    i=j;
  }
  return{a:ad,d:dl,h:hunks};
}
// keep at most DF_MAXL lines per file; om = changed lines left out
function dfCap(p,k,r){
  let room=DF_MAXL,om=0;const h=[];
  r.h.forEach(hk=>{
    if(room<=0){om+=hk.l.filter(e=>e[0]!==' ').length;return}
    if(hk.l.length<=room){h.push(hk);room-=hk.l.length;return}
    const part=hk.l.slice(0,room);om+=hk.l.slice(room).filter(e=>e[0]!==' ').length;h.push({h:hk.h,l:part});room=0;
  });
  return{p:p,k:k,a:r.a,d:r.d,h:h,om:om};
}
function dfFile(rel,kind,oldT,newT){return dfCap(rel,kind,dfText(oldT,newT,3))}
function dfNew(rel,text){
  const L=dfSplit(text),n=Math.min(L.length,30);
  return{p:rel,k:'new',a:L.length,d:0,h:[{h:'',l:L.slice(0,n).map((x,i)=>['+',i+1,dfCut(x,DF_LINE)])}],om:Math.max(0,L.length-n)};
}
function dfEdit(rel,ed,res){
  let a=0,d=0;const h=[];
  (ed||[]).slice(0,8).forEach((e,k)=>{
    const ln=res&&Array.isArray(res.lines)&&res.lines.length===ed.length?(+res.lines[k]||0):0;
    const r=dfText(e.old,e.new,0,ln);a+=r.a;d+=r.d;r.h.forEach(x=>h.push(x));
  });
  return dfCap(rel,'edit',{a:a,d:d,h:h});
}
function tcDiff(name,obj){
  try{
    if(!obj||!TC_CUR||TC_CUR.n!==name)return;
    const c=TC_CUR;c.df=c.df||[];
    if(c.df.length<DF_FILES){c.df.push(obj);c.x=1}
  }catch(e){}
}
const dfStat=(a,d)=>'<span class="dfsum"><b class="a">+'+a+'</b><b class="d">-'+d+'</b></span>';
function dfHead(f){
  const kind=f.k==='new'?'nayi file':f.na?'overwrite':'';
  return'<span class="dfp">'+esc(f.p)+'</span>'+(kind?'<span class="dfb">'+kind+'</span>':'')+(f.na?'':dfStat(f.a,f.d));
}
function dfBody(f){
  let h='';
  if(!f.h.length&&!f.om)h+='<div class="dfm">'+(f.na?'Poori file badli, purana content padha nahi ja saka.':'Koi line change nahi.')+'</div>';
  f.h.forEach(k=>{
    if(k.h)h+='<div class="dfk">'+esc(k.h)+'</div>';
    h+='<div class="dfr">'+k.l.map(e=>'<div class="dfl '+(e[0]==='+'?'a':e[0]==='-'?'d':'c')+'"><span class="dfn">'+(e[1]||'')+'</span><span class="dfg">'+(e[0]===' '?'':e[0])+'</span><span class="dft">'+esc(e[2])+'</span></div>').join('')+'</div>';
  });
  if(f.om)h+='<div class="dfm">+'+f.om+' badli hui lines aur, yahan nahi dikhayi.</div>';
  return h;
}
const dfHtml=f=>'<div class="dff"><div class="dfh">'+dfHead(f)+'</div>'+dfBody(f)+'</div>';
const dfAll=m=>(m&&m.cards?m.cards:[]).reduce((r,c)=>c.df?r.concat(c.df):r,[]);
function dfUnified(files){
  return files.map(f=>{
    let t='--- '+f.p+(f.k==='new'?' (nayi file)':'')+'\n';
    f.h.forEach(k=>{if(k.h)t+=k.h+'\n';k.l.forEach(e=>{t+=(e[0]===' '?' ':e[0])+e[2]+'\n'})});
    if(f.om)t+='... +'+f.om+' lines aur\n';
    return t;
  }).join('\n');
}
const DF_ICO='<svg class="rvi" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3v12M8 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM16 21V9M16 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/></svg>';
function dfReviewH(m,hi){
  const fs=dfAll(m);if(!fs.length)return'';
  const n=new Set(fs.map(f=>f.p)).size;
  return'<button type="button" class="rvb" data-hi="'+(hi==null?'':hi)+'">'+DF_ICO+'<span class="rvt">'+n+' file'+(n>1?'s':'')+' badli</span>'+dfStat(fs.reduce((x,f)=>x+f.a,0),fs.reduce((x,f)=>x+f.d,0))+TC_CHEV+'</button>';
}
var DFV={files:[]};
function dfvDraw(){
  const fs=DFV.files,box=$('#dfl');if(!box)return;
  box.innerHTML=fs.map((f,i)=>'<div class="dfw'+(fs.length<=3||i===0?' open':'')+'"><button type="button" class="dfsh" aria-expanded="'+(fs.length<=3||i===0?'true':'false')+'">'+TC_CHEV+dfHead(f)+'</button><div class="dfsb">'+dfBody(f)+'</div></div>').join('')||'<div class="lgn">Koi badlav nahi.</div>';
  const c=$('#dfcnt');if(c)c.textContent=fs.length+(fs.length===1?' diff':' diffs');
}
function dfvOpen(m){
  const v=$('#dfv');if(!v)return;
  DFV.files=dfAll(m);dfvDraw();v.classList.add('open');
  const b=$('#dfl');if(b)b.scrollTop=0;
}
function dfvClose(){const v=$('#dfv');if(v)v.classList.remove('open')}
(function dfvInit(){
  if(!$('#dfv')||typeof document.addEventListener!=='function')return;
  $('#dfvx').onclick=dfvClose;
  $('#dfvc').onclick=()=>{copyTxt(dfUnified(DFV.files)||'(khaali)').then(()=>{const b=$('#dfvc'),o=b.innerHTML;b.innerHTML=typeof ICO_OK!=='undefined'?ICO_OK:'ok';setTimeout(()=>{b.innerHTML=o},1200)})};
  $('#dfl').addEventListener('click',e=>{
    const h=e.target&&e.target.closest?e.target.closest('.dfsh'):null;if(!h)return;
    const w=h.parentNode,o=w.classList.toggle('open');h.setAttribute('aria-expanded',o?'true':'false');
  });
})();
