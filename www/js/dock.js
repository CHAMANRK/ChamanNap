// U4 (1.45000.0): risk dock. Sabse naya pending confirm (sms / call / termux / schedule_ai / file delete...) composer ke upar chipka rehta hai,
// chat scroll ho jaye tab bhi. Dock me sirf risk ki saaf line, kaam ka text/command aur Allow/Cancel.
// Dock ke button chat card ke apne `.abtn` ko click karte hain (phone.js handler, termux resolve, bubble.js sab pehle jaise), naya confirm logic nahi.
// Chat card ke buttons DOM me rehte hain par chhup jate hain (`.acts.rdoff`), us jagah "Allow/Cancel neeche dock me" likha aata hai.
const RD={sig:'',el:null};
const RD_ICO='<svg viewBox="0 0 24 24"><path d="M12 3l8 3v5c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V6z"/><path d="M12 8v5M12 16.2v.3"/></svg>';
const RD_HI=/delete|disk|root|recursive|download karke|band karna|bahar ki jagah|overwrite|hata|mita|poori disk/i;
function rdPending(){for(let k=H.length-1;k>=0;k--){const m=H[k];if(m&&m.confirm&&m.confirm.state==='pending')return k}return-1}
// confirm message -> {title, why, body, level, risk, btns}
function rdParts(m){
  const c=m.confirm,lines=String(m.content||'').split('\n');
  let title=(lines.shift()||'').replace(/:\s*$/,'').trim()||'Confirm chahiye',why='';
  const keep=[];
  for(const l of lines){
    if(/^```/.test(l))continue;
    const w=l.match(/^Wajah:\s*(.*)$/);
    if(w){why=w[1].trim();continue}
    keep.push(l);
  }
  const body=keep.join('\n').replace(/\n{3,}/g,'\n\n').trim().slice(0,1500);
  let risk,level='mid';
  if(c.type==='sms')risk='Ye SMS turant jayega, wapas nahi ho sakta.';
  else if(c.type==='call')risk='Call turant lag jayegi.';
  else if(why){risk=why;if(RD_HI.test(why))level='hi'}
  else risk='Ye kaam phone par chalega.';
  const lab=c.lab||(c.type==='sms'?'Bhejo':c.type==='termux'?'Chalao':'Call karo');
  const opts=c.opts||[];
  const btns=opts.map((o,i)=>({o:String(i),l:opts.length>1?lab+': '+(o.name||''):lab}));
  return{title:title.slice(0,90),body,level,risk,btns};
}
function rdBuild(idx){
  const m=H[idx],p=rdParts(m);
  return'<div class="rdh">'+RD_ICO+'<b>'+esc(p.title)+'</b></div>'
    +'<div class="rdr"><b>Risk:</b> '+esc(p.risk)+'</div>'
    +(p.body?'<pre class="rdb">'+esc(p.body)+'</pre>':'')
    +'<div class="rda">'+'<button type="button" class="rdn" data-m="'+idx+'" data-o="x">'+(H[idx].confirm.type==='cn'?'Deny':'Cancel')+'</button>'
    +p.btns.map(b=>'<button type="button" class="rdy'+(p.btns.length>1?' w':'')+'" data-m="'+idx+'" data-o="'+b.o+'">'+esc(b.l)+'</button>').join('')+'</div>';
}
function rdEl(){
  if(RD.el&&RD.el.isConnected)return RD.el;
  const f=$('#f');if(!f||!f.parentNode)return null;
  const el=document.createElement('div');el.id='rdock';el.setAttribute('role','group');el.setAttribute('aria-label','Confirm chahiye');el.hidden=true;
  f.parentNode.insertBefore(el,f);RD.el=el;return el;
}
// called at the end of every render()
function rdSync(){
  const el=rdEl();if(!el)return;
  const idx=rdPending();
  if(idx<0){if(!el.hidden){el.hidden=true;el.innerHTML=''}RD.sig='';return}
  // chat card: hide its own buttons (they stay in the DOM and stay clickable by code) and point to the dock
  document.querySelectorAll('#chat .abtn[data-m="'+idx+'"]').forEach(b=>{const a=b.closest('.acts');if(a)a.classList.add('rdoff')});
  const m=H[idx],sig=idx+':'+String(m.content||'').length+':'+((m.confirm.opts||[]).length);
  if(sig===RD.sig&&!el.hidden)return;
  RD.sig=sig;
  const c=$('#chat'),near=c?c.scrollHeight-c.scrollTop-c.clientHeight<90:false;
  el.className=rdParts(m).level==='hi'?'hi':'';
  el.innerHTML=rdBuild(idx);el.hidden=false;
  if(near&&c)c.scrollTop=c.scrollHeight;
}
document.addEventListener('click',e=>{
  const b=e.target.closest&&e.target.closest('#rdock button[data-o]');if(!b)return;
  const t=document.querySelector('#chat .abtn[data-m="'+b.dataset.m+'"][data-o="'+b.dataset.o+'"]');
  if(t)t.click();else if(typeof render==='function')render();
});
