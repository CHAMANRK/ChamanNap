// step26: floating mini Chaman. A small icon over other apps; tap = compact panel (message, answer, Allow/Cancel).
// Native (ChamanBubble.java) draws everything and only queues events; this file polls them and runs the NORMAL paths:
//  - send:    fills the chat input and fires the same submit handler as the Send button (chat.js), so providers, tools,
//             sessions, logs and Stop work exactly as in the app.
//  - confirm: clicks the same .abtn button the chat card has (phone.js handler), so sms/call/termux/schedule_ai need no extra code.
//  - stop:    stopTurn().
// Going the other way: the status line text already reaches native through NS('line') (status.js); this file adds the answer
// (bubTurnEnd) and the confirm card (bubSync, called from render()).
var BUB={tm:0,ok:false,ov:false,from:false,sig:'',poll:false};
function bubOn(){return !!(S.bub&&S.bub.on)}
// true when the panel can really be shown, so a confirm card must NOT pull Chaman to the front
function bubLive(){return bubOn()&&BUB.ok}
function bubQuiet(){return bubLive()&&BUB.from}
const bubPlain=t=>String(t==null?'':t).replace(/```[a-z0-9]*\n?/gi,'').replace(/[*`#>]+/g,'').replace(/\n{3,}/g,'\n\n').trim().slice(0,700);
function bubApply(){
  if(bubOn()){
    NS('bubble',{on:true}).then(r=>{BUB.ok=!!(r&&r.a11y);BUB.ov=!!(r&&r.overlay)}).catch(()=>{BUB.ok=false});
    if(!BUB.tm){BUB.tm=setInterval(bubPoll,700);if(BUB.tm&&BUB.tm.unref)BUB.tm.unref()}
    BUB.sig='\u0000';bubSync();
  }else{
    BUB.ok=false;
    if(BUB.tm){clearInterval(BUB.tm);BUB.tm=0}
    NS('bubble',{on:false}).catch(()=>{});
  }
}
async function bubPoll(){
  if(BUB.poll)return;BUB.poll=true;
  try{
    const r=await NS('bubblePoll');
    for(const s of((r&&r.events)||[])){let e=null;try{e=typeof s==='string'?JSON.parse(s):s}catch(x){}if(e)bubEvent(e)}
  }catch(x){}
  BUB.poll=false;
}
function bubEvent(e){
  if(e.type==='send')bubSend(String(e.text||''));
  else if(e.type==='stop'){if(busy)stopTurn()}
  else if(e.type==='confirm'){
    const b=document.querySelector('.abtn[data-m="'+Number(e.m)+'"][data-o="'+String(e.o).replace(/[^0-9x]/g,'')+'"]');
    if(b&&b.click)b.click();
  }
}
function bubSend(t){
  t=String(t||'').trim();if(!t)return;
  if(busy){NS('bubbleAnswer',{text:'Pehla kaam chal raha hai. Ruko ya Stop dabao.',open:true}).catch(()=>{});return}
  const i=$('#in'),old=i.value,pend=PEND;
  PEND=[];i.value=t;BUB.from=true;
  try{$('#f').dispatchEvent(new Event('submit',{cancelable:true,bubbles:true}))}
  finally{i.value=old;PEND=pend}
}
// the last answer goes to the panel. Only a turn that was started from the panel opens it by itself.
function bubTurnEnd(){
  if(!bubOn())return;
  const from=BUB.from;BUB.from=false;
  let m=null;
  for(let k=H.length-1;k>=0;k--){const x=H[k];if(x.role==='user')break;if(x.role==='assistant'&&!x.confirm&&!x.imgp){m=x;break}}
  const t=m?bubPlain(m.content):'';
  NS('bubbleAnswer',{text:t,open:!!from,fail:!!(m&&m.err)}).catch(()=>{});
}
// the newest pending confirm card of the chat goes to the panel as a compact card (title, 2-6 lines, buttons)
function bubSync(){
  if(!bubOn())return;
  let idx=-1;
  for(let k=H.length-1;k>=0&&k>=H.length-8;k--){const m=H[k];if(m&&m.confirm&&m.confirm.state==='pending'){idx=k;break}}
  const sig=idx<0?'':idx+':'+String(H[idx].content||'').length;
  if(sig===BUB.sig)return;BUB.sig=sig;
  if(idx<0){NS('bubbleCard',{card:''}).catch(()=>{});return}
  const m=H[idx],c=m.confirm,lines=String(m.content||'').split('\n');
  let title=(lines.shift()||'').replace(/:\s*$/,'').trim()||'Confirm chahiye';
  const body=lines.filter(l=>!/^```/.test(l)).join('\n').replace(/\n{2,}/g,'\n').trim().slice(0,320);
  const lab=c.lab||(c.type==='sms'?'Bhejo':c.type==='termux'?'Chalao':'Call karo');
  const btns=(c.opts||[]).map((o,i)=>({l:(c.opts.length>1?lab+': '+o.name:lab).slice(0,28),o:String(i)}));
  btns.push({l:'Cancel',o:'x'});
  NS('bubbleCard',{card:JSON.stringify({title:title.slice(0,80),body,m:idx,btns})}).catch(()=>{});
}
setTimeout(bubApply,900);
if(typeof document.addEventListener==='function')document.addEventListener('visibilitychange',()=>{if(!document.hidden&&bubOn())NS('bubble',{on:true}).catch(()=>{})});
