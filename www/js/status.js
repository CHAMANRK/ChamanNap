// step18: live status line. ONE store (LN), drawn twice: in the chat (instead of the 3 dots) and as the overlay line
// over other apps (native 'line'). The app writes every word, the AI never does. Starts when the message is sent,
// ends when the answer is ready: waiting for a provider, provider switch, tools, confirm waits.
var LN={on:false,text:'',state:'run',items:[],open:false,tw:0,last:'',timer:0,hold:false};
const LN_KEEP=40;
const LN_LAB={
  torch:'Torch chala raha hu',set_volume:'Volume badal raha hu',set_brightness:'Brightness badal raha hu',
  call:'Call ki taiyari',send_sms:'SMS ki taiyari',read_sms:'SMS padh raha hu',
  screen_read:'Screen padh raha hu',screen_click:'Tap kar raha hu',screen_type:'Type kar raha hu',screen_scroll:'Scroll kar raha hu',screen_key:'Key daba raha hu',
  open_url:'Link khol raha hu',tap_when_visible:'Button ka wait',run_flow:'Steps chala raha hu',set_switch:'Switch badal raha hu',
  rules_read:'Rules padh raha hu',file_list:'Folder dekh raha hu',file_read:'File padh raha hu',file_search:'Files dhoondh raha hu',
  file_write:'File likh raha hu',edit_file:'File edit kar raha hu',file_mkdir:'Folder bana raha hu',file_move:'File move kar raha hu',
  file_delete:'File hata raha hu',file_present:'File dikha raha hu',generate_image:'Image bana raha hu',api_check:'Termux:API check kar raha hu',
  termux_run:'Command chala raha hu',termux_write_file:'File likh raha hu',termux_read_file:'File padh raha hu',
  memory_read:'Memory padh raha hu',memory_save:'Memory save kar raha hu',memory_search:'Memory dhoondh raha hu',
  note_save:'Note save kar raha hu',note_get:'Note dhoondh raha hu',ask_user:'Tumhare action ka wait',wait_for_user:'Tumhare action ka wait'
};
const lnWhy=e=>{const m=String(e&&e.message||e),h=/HTTP (\d+)/.exec(m);return h?'HTTP '+h[1]:/timeout/i.test(m)?'timeout':'error'};
const lnCut=(t,n)=>{t=String(t==null?'':t).replace(/\s+/g,' ').trim();return t.length>n?t.slice(0,n-1)+'...':t};
// label: short, no typed text, no numbers, no SMS body
function lnLabel(name,a){
  a=a||{};
  switch(name){
    case'open_app':return'Khol raha hu: '+lnCut(a.name,22);
    case'open_intent':return'Khol raha hu: '+lnCut(String(a.name||'').replace(/_/g,' '),22);
    case'run_code':return({js:'JavaScript',sql:'SQL',py:'Python'}[a.lang]||'Code')+' chala raha hu';
    case'device_api':return'Phone se: '+lnCut(String(a.name||'').replace(/_/g,' '),20);
    case'set_switch':return'Switch: '+lnCut(a.text,16)+' '+lnCut(a.state,4);
  }
  return LN_LAB[name]||lnCut(name,28);
}
// result: private tools only say ho gaya / fail, others use the app's own note (first line, short)
const LN_PRIV=/^(screen_type|send_sms|call|read_sms|termux_run|termux_write_file|termux_read_file|run_code|note_get|memory_read|memory_search|file_read|file_search|device_api|api_check|screen_read)$/;
function lnResult(name,a,bad,res,note){
  if(name==='screen_type')return bad?'fail':'Type kiya ('+String(a&&a.text!=null?a.text:'').length+' char)';
  if(name==='screen_read'){const m=/(\d+) items/.exec(note||'');return bad?'fail':(m?m[1]+' items':'padh li')}
  if(bad)return lnCut(LN_PRIV.test(name)?'fail':(note||'fail'),40);
  if(LN_PRIV.test(name))return'ho gaya';
  return lnCut(String(note||'ho gaya').split('\n')[0],40);
}
const lnShow=()=>{
  if(LN.state!=='wait'||!LN.tw)return LN.text;
  const s=Math.floor((Date.now()-LN.tw)/1000);
  return s>=8?LN.text+'  '+s+'s':LN.text;
};
function lnSend(){
  if(!LN.on)return;
  if(!LN.hold)NS('line',{text:lnShow(),state:LN.state,items:JSON.stringify(LN.items.slice(-8))})
    .then(r=>{if(r&&r.err&&String(r.err).indexOf('Accessibility')<0&&typeof PILL_ERR!=='undefined'&&!PILL_ERR)PILL_ERR=r.err}).catch(()=>{});
  lnDraw();
}
function lnTick(){
  if(!LN.on)return;
  if(LN.state==='wait'&&LN.tw&&Date.now()-LN.tw>=8000)lnSend();
  const t=setTimeout(lnTick,1000);if(t&&t.unref)t.unref();LN.timer=t;
}
function lnBegin(text,state){
  LN.on=true;LN.items=[];LN.open=false;LN.last='';LN.hold=false;
  LN.text=text||'Message bhej raha hu';LN.state=state||'wait';LN.tw=LN.state==='wait'?Date.now():0;
  if(LN.timer)clearTimeout(LN.timer);
  const t=setTimeout(lnTick,1000);if(t&&t.unref)t.unref();LN.timer=t;
  lnSend();
}
function lnSet(text,state){
  if(!LN.on)return;
  const st=state||'run';
  if(LN.text!==text||LN.state!==st)LN.tw=st==='wait'?Date.now():0;
  LN.text=text;LN.state=st;lnSend();
}
function lnStep(name,a){
  if(!LN.on)lnBegin('Kaam chal raha hai','run');
  const it=[lnLabel(name,a),'run',''];
  LN.items.push(it);if(LN.items.length>LN_KEEP)LN.items.shift();
  LN.text=it[0];LN.state='run';LN.tw=0;lnSend();
  return it;
}
function lnStepEnd(it,name,a,bad,res,note){
  if(!it)return;
  it[1]=bad?'fail':'ok';it[2]=lnResult(name,a,bad,res,note);
  LN.text=it[0];LN.state=bad?'fail':'ok';LN.tw=0;lnSend();
}
function lnEnd(){
  if(LN.timer){clearTimeout(LN.timer);LN.timer=0}
  if(!LN.on)return;
  LN.on=false;LN.open=false;LN.hold=false;
  NS('line',{off:true}).catch(()=>{});
  lnDraw();
}
const LN_ARR='<svg class="lna" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
function lnHtml(roll){
  const n=LN.items.length,open=LN.open&&n>0;
  let h='<div class="lnl"><span class="lnd '+LN.state+'"></span><span class="lnt'+(roll?' rl':'')+'">'+esc(lnShow())+'</span>'+(n?'<span class="lnk'+(open?' o':'')+'">'+LN_ARR+'</span>':'')+'</div>';
  if(open){
    h+='<div class="lnx">'+LN.items.slice(-8).map(x=>'<div class="lni"><span class="lnd s '+x[1]+'"></span>'+esc(x[0])+'</div>'+(x[2]?'<div class="lnr">'+esc(x[2])+'</div>':'')).join('')+'</div>';
  }
  return h;
}
function lnDraw(){
  const c=$('#chat');if(!c)return;
  let ty=$('#ty');
  if(!LN.on||!busy){if(ty&&ty.remove)ty.remove();return}
  if(!ty){c.insertAdjacentHTML('beforeend','<div class="msg ai ln" id="ty"></div>');ty=$('#ty')}
  if(!ty)return;
  const roll=LN.last!==LN.text;LN.last=LN.text;
  ty.innerHTML=lnHtml(roll);
  c.scrollTop=1e9;
}
$('#chat').addEventListener('click',e=>{
  if(!e.target.closest||!e.target.closest('.lnl'))return;
  if(!LN.on||!LN.items.length)return;
  LN.open=!LN.open;LN.last=LN.text;lnDraw();
});
