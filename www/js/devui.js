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
      case'termux_run':t=String(a.command||'').split('\n')[0];break;
      case'file_write':case'file_read':case'edit_file':case'file_delete':case'file_mkdir':case'file_list':case'file_present':case'file_search':case'file_move':case'termux_write_file':case'termux_read_file':t=a.path||a.from||'';break;
      case'open_url':t=String(a.uri||'').replace(/^https?:\/\//,'').split(/[?#]/)[0];break;
      case'run_code':t=a.lang||'';break;
      case'open_app':case'open_intent':case'device_api':t=String(a.name||'').replace(/_/g,' ');break;
    }
  }catch(e){t=''}
  if(typeof logClean==='function')t=logClean(t);
  return tcCut(t,70);
}
function tcBegin(steps,name,a){
  try{
    if(!steps)return null;
    if(!steps.cards)steps.cards=[];
    if(steps.cards.length>=TC_MAX)return null;
    const c={n:name,k:tcKind(name),l:(typeof lnLabel==='function'?lnLabel(name,a):String(name)),g:tcTarget(name,a),s:'run',t0:Date.now(),t:0,r:'',nt:[],i:steps.length,j:steps.length};
    steps.cards.push(c);
    return c;
  }catch(e){return null}
}
function tcEnd(c,steps,name,a,bad,res,note){
  try{
    if(!c)return;
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
  if(c.r&&!run)body+='<div class="tcr">'+esc(c.r)+'</div>';
  (c.nt||[]).forEach(x=>{body+='<div class="tcn">'+esc(x)+'</div>'});
  if(run)body+='<div class="tcr">Chal raha hai...</div>';
  if(!body)body='<div class="tcr">Koi detail nahi.</div>';
  return'<div class="tc '+st+(open?' open':'')+'" role="listitem"'+(ci!=null?' data-ci="'+ci+'"':'')+'>'
    +'<button type="button" class="tch" aria-expanded="'+(open?'true':'false')+'">'
    +tcSvg(TC_ICO[c.k]||TC_ICO.gear)
    +'<span class="tcm"><span class="tcl">'+esc(c.l||c.n)+'</span>'+(c.g?'<span class="tcg">'+esc(c.g)+'</span>':'')+'</span>'
    +tcStat(st)+'<span class="tce'+(run?' tcel':'')+'"'+(run?' data-t0="'+(c.t0||0)+'"':'')+'>'+esc(tm)+'</span>'+TC_CHEV+'</button>'
    +'<div class="tcb">'+body+'</div></div>';
}
// finished message: the cards, then any step lines no card owns (rare app notes)
function cardsH(m){
  // a card still 'run' in history = the app stopped before it ended: show it as failed, not as running forever
  const cs=(m.cards||[]).map(c=>c.s==='run'?Object.assign({},c,{s:'fail',t:-1,r:'ruk gaya, result nahi aaya'}):c);
  let h='<div class="tcs-list" role="list">'+cs.map(c=>tcRow(c,null)).join('')+'</div>';
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
  const from=Math.max(0,cs.length-8);
  let h='<div class="tcs-list live" role="list">';
  if(from>0)h+='<div class="tcmore">+'+from+' pehle ke kaam ho chuke</div>';
  for(let i=from;i<cs.length;i++)h+=tcRow(cs[i],i);
  return h+'</div>';
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
    const h=T.closest('.tch');
    if(h){
      const c=h.parentNode,o=c.classList.toggle('open');h.setAttribute('aria-expanded',o?'true':'false');
      const ci=c.getAttribute('data-ci');
      if(ci!==null&&ci!==''){const L=tcLive()[+ci];if(L)L.x=o?1:0}
      return;
    }
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
