function fbCopy(t){const a=document.createElement('textarea');a.value=t;a.style.cssText='position:fixed;opacity:0';document.body.appendChild(a);a.select();try{document.execCommand('copy')}catch(e){}a.remove()}
function copyTxt(t){
  if(navigator.clipboard&&navigator.clipboard.writeText)return navigator.clipboard.writeText(t).catch(()=>fbCopy(t));
  fbCopy(t);return Promise.resolve();
}
$('#chat').addEventListener('click',e=>{
  const b=e.target.closest('.cp');if(!b)return;
  const c=b.closest('.code').querySelector('code');
  copyTxt(c.textContent).then(()=>{b.innerHTML=ICO_OK;setTimeout(()=>{b.innerHTML=ICO_COPY},1500)});
});

const NPx=(pl,m,o)=>{
  const C=window.Capacitor;
  if(!C||!(C.nativePromise||C.Plugins))return Promise.reject(new Error('Ye command sirf Android app me chalta hai.'));
  if(C.nativePromise)return C.nativePromise(pl,m,o||{});
  const p=C.Plugins&&C.Plugins[pl];
  if(p&&p[m])return p[m](o||{});
  return Promise.reject(new Error('Native plugin load nahi hua.'));
};
const NP=(m,o)=>NPx('PhoneControl',m,o);
const NS=(m,o)=>NPx('ScreenControl',m,o);
const NT=(m,o)=>NPx('Termux',m,o);
const errMsg=e=>(e&&(e.message||e.errorMessage))||String(e);
function persist(){sv('nap_h',H.map(m=>m.role==='user'?Object.assign({},m,{imgs:undefined,files:(m.files||[]).map(a=>({name:a.name,size:a.size,kind:a.kind}))}):m))}
function aiText(m){
  if(m.confirm)return'[app log] '+(m.confirm.type==='sms'?'SMS bhejne ka confirm':m.confirm.type==='termux'?'Termux command/file ka confirm':'Call karne ka confirm')+' - '+m.confirm.state;
  if(m.local)return'[app log] '+(m.aiNote||m.content);
  return m.content;
}
function acts(m,hi){
  if(!m.confirm||m.confirm.state!=='pending')return'';
  const c=m.confirm,lab=c.type==='sms'?'Bhejo':c.type==='termux'?'Chalao':'Call karo';
  return'<div class="acts">'+c.opts.map((o,i)=>'<button type="button" class="abtn" data-m="'+hi+'" data-o="'+i+'">'+esc(c.opts.length>1?lab+': '+o.name:lab)+'</button>').join('')+'<button type="button" class="abtn x" data-m="'+hi+'" data-o="x">Cancel</button></div>';
}
