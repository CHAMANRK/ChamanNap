// Slash commands. A command runs ONLY when it was picked from the list that opens when the message starts with "/".
// Typed by hand without picking it, "/note ..." is just text for the AI (so the AI can never trigger a command by writing it).
const SLASH=[
  {name:'note',hint:'Note save karo ya dhundo',run:a=>noteCmd(a)},
  {name:'n',hint:'/note ka short',run:a=>noteCmd(a)},
  {name:'provider',hint:'AI provider badlo',run:a=>setProv(String(a).trim().split(/\s+/)[0]||'')},
  {name:'p',hint:'/provider ka short',run:a=>setProv(String(a).trim().split(/\s+/)[0]||'')}
];
let SL_ARM='';
const slBox=()=>$('#slash');
function hideSlash(){const b=slBox();b.style.display='none';b.innerHTML=''}
function slashSync(){
  const i=$('#in'),v=i.value;
  if(SL_ARM&&!(v===SL_ARM||v.indexOf(SL_ARM+' ')===0||v.indexOf(SL_ARM+'\n')===0))SL_ARM='';
  if(SL_ARM||!/^\/[A-Za-z]*$/.test(v)){hideSlash();return}
  const q=v.slice(1).toLowerCase(),rows=SLASH.filter(c=>c.name.indexOf(q)===0);
  if(!rows.length){hideSlash();return}
  const b=slBox();
  b.innerHTML=rows.map(c=>'<button type="button" class="srow" data-c="'+c.name+'"><b>/'+c.name+'</b><span>'+esc(c.hint)+'</span></button>').join('');
  b.style.display='block';
}
function slashPick(name){
  const i=$('#in');SL_ARM='/'+name;i.value=SL_ARM+' ';hideSlash();
  i.style.height='auto';i.style.height=i.scrollHeight+'px';i.focus();
}
// Returns {cmd,arg} when the text starts with the command that was picked from the list, else null (plain text).
function slashTake(t){
  const a=SL_ARM;SL_ARM='';
  if(!a||!(t===a||t.indexOf(a+' ')===0||t.indexOf(a+'\n')===0))return null;
  const c=SLASH.find(x=>'/'+x.name===a);
  return c?{cmd:c,arg:t.slice(a.length).replace(/^\s+/,'')}:null;
}
async function slashRun(sl,t){
  busy=true;$('#send').disabled=true;
  logAdd('you','/'+sl.cmd.name+' ('+sl.arg.length+' chars)');
  H.push({role:'user',content:t,info:1});
  try{await sl.cmd.run(sl.arg)}catch(e){H.push({role:'assistant',by:'App',info:1,content:'Command fail: '+errMsg(e)})}
  H=H.slice(-100);persist();busy=false;$('#send').disabled=false;render();logFlush();
}
$('#in').addEventListener('input',slashSync);
$('#slash').addEventListener('pointerdown',e=>{const b=e.target.closest('.srow');if(!b)return;e.preventDefault();slashPick(b.dataset.c)});
