// Step15: Termux:API. device_api runs a fixed list of termux-* commands (no free text commands), api_check tells what is missing.
// Needs: Termux:API app (same source as Termux) + `pkg install termux-api` inside Termux. Output of private things (clipboard, location) is for the AI to use, never saved by the app.
const API_DIR=WS_ROOT+'/work/api';
const apiNum=(p,k,lo,hi,def)=>{const r=p[k];if((r===undefined||r===null||r==='')&&def!==undefined)return def;const n=+r;if(!isFinite(n)||n<lo||n>hi)throw new Error(k+' '+lo+' se '+hi+' ke beech hona chahiye.');return Math.round(n)};
const apiTxt=(p,k,max)=>{const v=String(p[k]==null?'':p[k]);if(!v.trim())throw new Error(k+' chahiye.');return v.slice(0,max||500)};
const apiFile=(p,ext)=>{const b=String(p.name||'').toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40)||('api-'+Date.now());return API_DIR+'/'+b+'.'+ext};
// name -> {d: description, p: params, run(p) -> {cmd, tmo, ask?: [head, body, why]}, fmt?}
const API={};
const adef=(n,d,p,run)=>{API[n]={d,p:p||'',run}};
adef('battery','battery level, charging state, temperature','',()=>({cmd:'termux-battery-status'}));
adef('clipboard_get','read the clipboard text','',()=>({cmd:'termux-clipboard-get'}));
adef('clipboard_set','put text in the clipboard','text',p=>({cmd:'termux-clipboard-set '+shq(apiTxt(p,'text',2000))}));
adef('location','GPS/network location once (lat, lon, accuracy)','provider? gps|network (default network)',p=>({cmd:'termux-location -p '+(p.provider==='gps'?'gps':'network')+' -r once',tmo:40}));
adef('wifi_info','current Wi-Fi name, signal, IP','',()=>({cmd:'termux-wifi-connectioninfo'}));
adef('torch','flashlight on/off','state on|off',p=>({cmd:'termux-torch '+(p.state==='on'?'on':p.state==='off'?'off':(()=>{throw new Error('state on ya off chahiye.')})())}));
adef('vibrate','vibrate the phone','ms? 50-3000 (default 400)',p=>({cmd:'termux-vibrate -f -d '+apiNum(p,'ms',50,3000,400)}));
adef('volume_get','all volume levels','',()=>({cmd:'termux-volume'}));
adef('volume_set','set one volume stream','stream music|ring|alarm|notification|system|call, level 0-15',p=>{
  const st=String(p.stream||'').toLowerCase();if(['music','ring','alarm','notification','system','call'].indexOf(st)<0)throw new Error('stream sahi nahi.');
  return{cmd:'termux-volume '+st+' '+apiNum(p,'level',0,15)};
});
adef('brightness','set screen brightness','level 0-255, or auto',p=>({cmd:'termux-brightness '+(String(p.level).toLowerCase()==='auto'?'auto':apiNum(p,'level',0,255))}));
adef('tts_speak','speak text aloud','text, lang? (en, hi...)',p=>{
  const l=String(p.lang||'').trim();if(l&&!/^[a-z]{2,3}(-[A-Za-z]{2})?$/.test(l))throw new Error('lang sahi nahi.');
  return{cmd:'termux-tts-speak '+(l?'-l '+shq(l)+' ':'')+shq(apiTxt(p,'text',500)),tmo:60};
});
adef('toast','show a short toast on screen','text',p=>({cmd:'termux-toast '+shq(apiTxt(p,'text',200))}));
adef('notify','show a notification','title, text',p=>({cmd:'termux-notification --id chaman-api -t '+shq(apiTxt(p,'title',80))+' -c '+shq(apiTxt(p,'text',300))}));
adef('camera_photo','take a photo (asks Najeef first) and save it in work/api','camera back|front, name?',p=>{
  const f=apiFile(p,'jpg'),c=p.camera==='front'?1:0;
  return{cmd:'mkdir -p '+shq(API_DIR)+' && termux-camera-photo -c '+c+' '+shq(f)+' && ls -l '+shq(f),tmo:40,ask:['Camera se photo lene se pehle confirm','Photo ('+(c?'front':'back')+' camera) -> '+f,['camera use']],out:f};
});
adef('mic_record','record the microphone (asks Najeef first), max 60 s, saved in work/api','seconds 1-60, name?',p=>{
  const s=apiNum(p,'seconds',1,60),f=apiFile(p,'m4a');
  return{cmd:'mkdir -p '+shq(API_DIR)+' && rm -f '+shq(f)+' && termux-microphone-record -f '+shq(f)+' -l '+s+' && sleep '+(s+2)+' && ls -l '+shq(f),tmo:s+30,ask:['Mic record karne se pehle confirm',s+' second ki recording -> '+f,['microphone use']],out:f};
});
adef('media_scan','tell the gallery about a new file (it then shows up)','path (inside /sdcard)',p=>{
  const v=apiTxt(p,'path',300);if(v.indexOf('/sdcard/')!==0||v.indexOf('..')>=0)throw new Error('path /sdcard/ ke andar hona chahiye.');
  return{cmd:'termux-media-scan '+shq(v)};
});
TOOLS.push(
  fn('api_check','Check whether Termux:API works (the Termux:API app is installed, the termux-api package is installed, the app answers). Returns what is missing and the exact next step for Najeef. Call it when device_api fails or before you promise an api job.',{}),
  fn('device_api','Phone hardware and system through Termux:API: '+Object.keys(API).join(', ')+'. name from the list; params as rules_read api shows. Fixed commands only. Camera and microphone ask Najeef with a confirm card first. Needs Termux and Termux:API (api_check).',{name:{type:'string',enum:Object.keys(API)},params:{type:'object'}},['name'])
);
// exit codes -> plain help
function apiHelp(code,err){
  if(code===127||/not found/i.test(err))return'termux-api package Termux me install nahi hai. Termux me ye chalana hai: pkg install termux-api (confirm card aayega). Saath me Termux:API app bhi chahiye.';
  if(code===124)return'Termux:API app ne jawab nahi diya. Ya to Termux:API app install nahi hai (Termux wale source se hi: F-Droid ya GitHub), ya uska permission band hai (Settings > Apps > Termux:API > Permissions: location/camera/mic allow karo). Phir api_check chalao.';
  return null;
}
async function apiTool(name,a,note,fl){
  if(name==='api_check'){
    let r;
    try{r=await NT('run',{command:'if ! command -v termux-battery-status >/dev/null 2>&1; then echo NOPKG; else out=$(timeout 12 termux-battery-status 2>&1); c=$?; if [ $c -eq 124 ]; then echo NOAPP; elif [ $c -ne 0 ]; then echo "ERR $c $out"; else echo OK; fi; fi',timeout:25})}
    catch(e){const m=termuxMsg(e&&e.code);fl.bad=true;return note('Termux fail')+' '+(m||errMsg(e))}
    const o=String(r.stdout||'').trim();
    if(o.indexOf('OK')===0)return note('Termux:API chal raha hai')+' Package aur Termux:API app dono theek, battery status mila. device_api use kar sakte ho.';
    fl.bad=true;
    if(o.indexOf('NOPKG')===0)return note('termux-api package nahi hai')+' Termux me pkg install termux-api chalao (termux_run se, confirm card aayega). Phir Termux:API app (Termux wale hi source se) install karke api_check dobara.';
    if(o.indexOf('NOAPP')===0)return note('Termux:API app jawab nahi de rahi')+' '+apiHelp(124,'');
    return note('Termux:API me dikkat')+' '+cut(o,200);
  }
  const d=API[String(a.name||'')];
  if(!d){fl.bad=true;return note('device_api name nahi mila. Options: '+Object.keys(API).join(', '))}
  let sp;
  try{sp=d.run(a.params&&typeof a.params==='object'?a.params:{})}catch(e){fl.bad=true;return note('Param galat')+' '+errMsg(e)}
  if(sp.ask&&!(await tconfirm(sp.ask[0],sp.ask[1],sp.ask[2]))){fl.bad=true;return note('Najeef ne cancel kiya.')+' Dobara mat karo, pucho kya karna hai.'}
  const tmo=sp.tmo||20;
  // wrap the whole command so a missing Termux:API app cannot hang
  const full='timeout '+tmo+' sh -c '+shq(sp.cmd);
  let r;
  try{r=await NT('run',{command:full,timeout:tmo+8})}
  catch(e){const m=termuxMsg(e&&e.code);fl.bad=true;logAdd('termux','device_api '+a.name+' -> fail');return note('Termux fail')+' '+(m||errMsg(e))}
  if(r.timeout){fl.bad=true;return note('Termux timeout')+' '+apiHelp(124,'')}
  const code=r.exitCode,out=String(r.stdout||'').trim(),err=String(r.stderr||'').trim();
  logAdd('termux','device_api '+a.name+' (exit '+code+')');
  if(code!==0){fl.bad=true;return note('API fail (exit '+code+')')+' '+(apiHelp(code,err)||cut(err||out||'koi message nahi',300))}
  return note('API: '+a.name)+(sp.out?' File: '+sp.out+'.':'')+'\n'+cut(out||'(koi output nahi, kaam ho gaya)',3000);
}
function apiRules(){
  return'TERMUX:API (device_api {name, params}; api_check tells if it works)\n- Fixed jobs, each one a termux-* command run silently: '+Object.keys(API).map(n=>n+(API[n].p?'('+API[n].p+')':'')).join('; ')
  +'\n- Run api_check before the first api job of a chat, or when device_api fails. Missing: the termux-api package (termux_run pkg install termux-api, confirm card) and the Termux:API app (install from the same source as Termux, open it once, allow location/camera/microphone for it in Settings). Tell Najeef exactly which one is missing.'
  +'\n- camera_photo and mic_record show a confirm card first. If he cancels, do not retry. Photos and recordings land in /sdcard/Chaman/work/api; use file_present to show a photo.'
  +'\n- Clipboard text and location are private: use them for his request only, never save them to memory or notes unless he asks.'
  +'\n- Not in the list on purpose: SMS, calls, contacts, fingerprint, sensors. Use call, send_sms, read_sms and the intents for those. If he asks for another termux-api feature: say he has not given it to you yet and what it would add.'
  +'\n- Say what a result shows (battery 63 percent), never more. A failed call is not done.';
}
