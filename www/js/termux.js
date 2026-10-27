// Termux integration: commands run silently in the background; everything is shown in the chat.
TOOLS.push(
  fn('termux_run','Run a bash command in Termux (background, no Termux screen). Returns stdout, stderr and exit code. Termux home is ~ and shared storage is /sdcard, so use it to read, create and edit files (cat, head, ls, cp, sed...). Not interactive: no sudo/ssh password prompts, no nano/vim. Risky or heavy commands automatically ask Najeef for confirmation. Keep output small (head, tail, grep).',{command:{type:'string'},timeout_s:{type:'integer',minimum:5,maximum:600,description:'default 120'}},['command']),
  fn('termux_write_file','Write text to a file in Termux or /sdcard (creates folders, overwrites). Overwriting a file or writing outside the Termux home asks Najeef for confirmation first. For reading use termux_run with cat/head.',{path:{type:'string',description:'~/notes.txt or /sdcard/Download/a.txt'},content:{type:'string'}},['path','content'])
);
const shq=s=>"'"+String(s).replace(/'/g,"'\\''")+"'";
const RISKS=[
  [/\brm\b/,'files delete'],
  [/\b(dd|mkfs\w*|fdisk|shred|wipefs)\b/,'disk write'],
  [/\b(chmod|chown)\b[^;|&]*\s-\w*R/i,'recursive permission change'],
  [/(^|[\s;&|(])(sudo|su|tsu)\b/,'root'],
  [/\b(kill|pkill|killall|reboot|shutdown|poweroff)\b/,'process ya system band karna'],
  [/\b(apt|apt-get|pkg|pip3?|npm|yarn|cargo|gem)\s+(install|i|add|upgrade|full-upgrade|dist-upgrade|remove|uninstall|purge|autoremove)\b/i,'package install/upgrade/remove'],
  [/\b(curl|wget)\b[^|;]*\|\s*(sudo\s+)?(ba|z)?sh\b/,'download karke chalana'],
  [/\b(mv|cp|rsync)\b[^;|&]*\/(sdcard|storage)\b/,'sdcard me move/copy'],
  [/>>?\s*\/(sdcard|storage|data|system|dev)\b/,'bahar ki jagah likhna'],
  [/\bfind\s+\/(\s|$)|\b(grep|du|ls)\b[^;|&]*\s-\w*[rR]\w*\s+\/(\s|$)/,'poori disk scan'],
  [/\bwhile\s+(true|:)\b|:\s*\(\s*\)\s*\{|\bfor\s*\(\(/,'infinite loop ho sakta hai'],
  [/\b(make|cmake|cargo\s+build|gradle|ffmpeg|tar|zip|7z|git\s+clone|docker)\b/,'heavy kaam']
];
function riskOf(cmd,tmo){const w=[];for(const x of RISKS)if(x[0].test(cmd))w.push(x[1]);if(tmo>180)w.push('lamba timeout ('+tmo+'s)');return w}
const TCONF={};
const noFence=s=>String(s==null?'':s).replace(/```/g,"'''");
function liveRender(){
  render();
  if(busy)$('#chat').insertAdjacentHTML('beforeend','<div class="msg ai dots" id="ty"><span></span><span></span><span></span></div>');
  $('#chat').scrollTop=1e9;
}
// Shows a confirm card in the chat and waits for the tap. Brings Chaman to the front if it is in the background.
function tconfirm(head,body,why){
  return new Promise(res=>{
    const id='t'+Date.now()+Math.random().toString(36).slice(2,6);
    TCONF[id]=res;
    H.push({role:'assistant',by:'Termux',local:1,content:head+':\n```\n'+noFence(cut(body,1500))+'\n```\nWajah: '+why.join(', '),confirm:{type:'termux',id,opts:[{name:''}],state:'pending'}});
    NS('finish',{quiet:true}).catch(()=>{});
    liveRender();
    setTimeout(()=>{
      if(!TCONF[id])return;
      delete TCONF[id];
      const m=H.find(x=>x.confirm&&x.confirm.id===id);
      if(m&&m.confirm.state==='pending'){m.confirm.state='expired';m.content+='\n\nTime khatam, cancel.'}
      liveRender();res(false);
    },180000);
  });
}
function termuxMsg(code){
  if(code==='NOT_INSTALLED')return'Termux install nahi hai (F-Droid ya GitHub wala chahiye).';
  if(code==='PERMISSION')return'Chaman ko "Run commands in Termux environment" permission do: Settings > Apps > Chaman > Permissions > Additional permissions. Termux me allow-external-apps=true bhi hona chahiye.';
  return null;
}
async function termuxExec(method,o,shown,note,fl){
  const tm={role:'assistant',by:'Termux',local:1,content:'```\n$ '+noFence(cut(shown,600))+'\n(chal raha hai...)\n```'};
  H.push(tm);liveRender();
  let r;
  try{r=await NT(method,o)}
  catch(e){
    const msg=termuxMsg(e&&e.code)||errMsg(e);
    tm.content='```\n$ '+noFence(cut(shown,600))+'\n'+noFence(msg)+'\n```';tm.aiNote='$ '+cut(shown,200)+' -> fail: '+msg;
    fl.bad=true;liveRender();return note('Termux fail: '+msg);
  }
  if(r.timeout){
    const msg='Termux ne time par jawab nahi diya. Command abhi chal rahi ho sakti hai, ya Termux me allow-external-apps=true nahi hai.';
    tm.content='```\n$ '+noFence(cut(shown,600))+'\n'+msg+'\n```';tm.aiNote='$ '+cut(shown,200)+' -> timeout';
    fl.bad=true;liveRender();return note('Termux timeout')+' '+msg;
  }
  const code=r.exitCode,out=String(r.stdout||''),err=String(r.stderr||'');
  const body=out+(err?(out?'\n':'')+'[stderr]\n'+err:'')+(r.errmsg?'\n[termux] '+r.errmsg:'');
  tm.content='```\n$ '+noFence(cut(shown,600))+'\n'+noFence(cut(body.trim()||'(koi output nahi)',6000))+'\n[exit '+code+']\n```';
  tm.aiNote='$ '+cut(shown,200)+' (exit '+code+')\n'+cut(body.trim(),400);
  if(code!==0)fl.bad=true;
  liveRender();
  return note('Termux: exit '+code)+'\nSTDOUT/STDERR (max 4000 chars):\n'+cut(body.trim()||'(koi output nahi)',4000);
}
async function termuxTool(name,a,note,fl){
  if(name==='termux_run'){
    const cmd=String(a.command||'').trim();
    if(!cmd){fl.bad=true;return note('Command khaali hai.')}
    const tmo=Math.min(600,Math.max(5,Math.round(+a.timeout_s||120))),why=riskOf(cmd,tmo);
    if(why.length&&!(await tconfirm('Termux command chalane se pehle confirm',cmd,why))){
      fl.bad=true;return note('Najeef ne command cancel kiya.')+' Wahi command dobara mat chalao, pucho kya karna hai.';
    }
    return await termuxExec('run',{command:cmd,timeout:tmo},cmd,note,fl);
  }
  if(name==='termux_write_file'){
    const path=String(a.path||'').trim(),content=String(a.content==null?'':a.content);
    if(!path){fl.bad=true;return note('Path nahi diya.')}
    if(content.length>100000){fl.bad=true;return note('Content bahut bada (max 100KB).')}
    const why=[];
    if(path.startsWith('/')&&path.indexOf('/data/data/com.termux')!==0)why.push('Termux home ke bahar likhna');
    else{
      try{
        const r=await NT('run',{command:'p='+shq(path)+'; case "$p" in "~"*) p="$HOME${p#?}";; esac; [ -e "$p" ] && echo EXISTS',timeout:15});
        if(String(r.stdout||'').indexOf('EXISTS')>=0)why.push('purani file overwrite hogi');
      }catch(e){const m=termuxMsg(e&&e.code);if(m){fl.bad=true;return note('Termux fail: '+m)}}
    }
    if(why.length&&!(await tconfirm('Termux file likhne se pehle confirm',path+' ('+content.length+' chars)\n\n'+cut(content,300),why))){
      fl.bad=true;return note('Najeef ne file likhna cancel kiya.')+' Dobara mat likho, pucho kya karna hai.';
    }
    return await termuxExec('write',{path,content},'write '+path+' ('+content.length+' chars)',note,fl);
  }
  fl.bad=true;return'Unknown tool: '+name;
}
