async function resolveWho(who){
  const d=who.replace(/[^\d+]/g,'');
  if(/^\+?\d{7,}$/.test(d)&&!/[a-z]/i.test(who))return[{name:d,number:d}];
  const r=await NP('findContact',{name:who});
  return r.matches||[];
}
function askConfirm(type,text,list){
  const o=list.slice(0,4);
  const head=type==='sms'?'SMS bhejna hai':'Call karna hai';
  const body=o.map(x=>x.name+(x.name!==x.number?' ('+x.number+')':'')).join('\n');
  H.push({role:'assistant',by:'Phone',local:1,content:head+(o.length>1?' - kisko?':'')+':\n'+body+(type==='sms'?'\n\n'+text:''),confirm:{type,text,opts:o,state:'pending'}});
}
const fmtDate=ms=>{try{return new Date(ms).toLocaleString([],{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}catch(e){return''}};
$('#chat').addEventListener('click',async e=>{
  const b=e.target.closest('.abtn');if(!b)return;
  const m=H[+b.dataset.m];if(!m||!m.confirm||m.confirm.state!=='pending')return;
  const c=m.confirm;
  if(c.type==='termux'){
    const res=TCONF[c.id];delete TCONF[c.id];
    if(b.dataset.o==='x'){c.state='cancelled';m.content+='\n\nCancel kar diya.'}else{c.state='done';m.content+='\n\nAllow kiya.'}
    logAdd('confirm','termux '+(b.dataset.o==='x'?'CANCEL':'ALLOW'));
    persist();render();if(res)res(b.dataset.o!=='x');return;
  }
  if(b.dataset.o==='x'){c.state='cancelled';m.content+='\n\nCancel kar diya.';logAdd('confirm',c.type+' CANCEL');persist();render();return}
  const o=c.opts[+b.dataset.o];if(!o)return;
  c.state='done';logAdd('confirm',c.type+' ALLOW: '+o.name+(c.type==='sms'?' ('+String(c.text||'').length+' chars)':''));m.content=(c.type==='sms'?'SMS':'Call')+': '+o.name+(c.type==='sms'?'\n\n'+c.text:'');
  render();
  try{
    if(c.type==='sms'){await NP('sendSms',{number:o.number,text:c.text});m.content+='\n\nSMS bhej diya.'}
    else{await NP('dial',{number:o.number});m.content+='\n\nCall laga raha hu.'}
  }catch(err){c.state='failed';m.content+='\n\nFail: '+errMsg(err);logAdd('error',c.type+' fail: '+errMsg(err))}
  persist();render();
});
