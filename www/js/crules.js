// Step23 (3a): custom rules = "if Najeef says this, then run these steps" (like a small Python if / else). The APP matches and runs them by code:
// no AI at run time. A rule = triggers (short phrases/keywords, matched loosely) + steps (any Chaman tool, reply, set, if/else, stop).
// Made by Najeef with /rule (list, show, on, off, del, test, run) or by telling the AI (tool rule_save, saved only after he taps Allow).
// Safety: steps run through execTool, so face lock and the confirm cards (SMS, call, risky Termux commands) still apply every time.
// Values put into a termux_run command are shell-quoted by the app; a {var} inside quotes is refused when the rule is saved.
// Not in 3a (next steps): ai / fetch steps, background (Java) runs, time triggers, creating rules by typing /rule add.
const CR_KEY='nap_rules',CR_FILE=WS_ROOT+'/rules.json';
const CR_MAX=30,CR_MAX_STEPS=15,CR_DEPTH=3,CR_RUN_CAP=40,CR_MAX_JSON=20000,CR_VAL_MAX=4000;
const CR_NEED=['link','rest'];
const CR_NOTOOL=['rule_save','rule_list'];
const CR_BUILTIN=['link','links','rest','msg','date','time','prev','name'];
const CR_URL=/https?:\/\/[^\s<>"'`]+/gi;
const CR_VARRE='\\{([a-z_][a-z0-9_]*)\\}';
const CR_STOP=new Set(('is isko ise ye yeh yahi isme ko ka ki ke me mein mai se par pe to ho hai hain tha the kar karo karde kardo karna karke kardena dena do de dedo dijiye '
  +'plz please pls bhai yaar bro the this that a an in on of it my mera meri mere mujhe mujhko aur or and for hi bhi na nahi').split(' '));
let CR=ld(CR_KEY,[]);
if(!Array.isArray(CR))CR=[];
const CR_HELP='Custom rules (if this then do this):\n'
  +'Rule banane ke liye AI ko bolo, jaise: "jab main \'isko playlist me add kar\' bolu aur link ho to Termux se audio download karke /sdcard/Vibe_Sound me daal do". AI rule dikhayega, tu Allow karega tab save hoga.\n\n'
  +'/rule list   /rule show <no|naam>   /rule on|off <no|naam>   /rule del <no|naam>\n'
  +'/rule test <message>   (batata hai kaun sa rule lagega, chalata nahi)\n'
  +'/rule run <no|naam> <text ya link>   (seedha chalao)\n\n'
  +'Rule bina /rule ke bhi chalta hai: bas wahi baat chat me bolo.';
TOOLS.push(
  fn('rule_save','Create or update one of Najeef\'s custom rules (if he says this, the app runs these steps by itself, without asking you). Call it when he says things like "jab main X bolu to Y karna" or "iska rule bana". Najeef must tap Allow on a confirm card, you cannot save without it. First call rules_read with area myrules for the exact format. name = short (a-z, 0-9, _). triggers = 1 to 8 short phrases or keywords he may say (add 2 to 4 variants). need = [\'link\'] if a URL is needed, [\'rest\'] if the rest of his text is needed. steps = list of step objects.',{name:{type:'string'},triggers:{type:'array',items:{type:'string'}},need:{type:'array',items:{type:'string',enum:['link','rest']}},steps:{type:'array',items:{type:'object'}},auto:{type:'boolean',description:'false = always ask before running it'}},['name','triggers','steps']),
  fn('rule_list','List Najeef\'s custom rules (name, on or off, triggers).',{})
);
const crSlug=s=>String(s==null?'':s).toLowerCase().replace(/[^a-z0-9_-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,40);
const crVarName=s=>{const v=String(s==null?'':s).toLowerCase();return/^[a-z_][a-z0-9_]{0,24}$/.test(v)?v:''};
const crSafe=v=>String(v==null?'':v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,'').slice(0,CR_VAL_MAX);
function crPersist(mirror){
  sv(CR_KEY,CR);
  if(mirror!==false){try{NF('write',{path:CR_FILE,content:JSON.stringify({v:1,rules:CR},null,1),backup:false}).catch(()=>{})}catch(e){}}
}
// If the phone's own copy is empty (app data cleared) but /sdcard/Chaman/rules.json exists, take the rules back from it.
async function crRestore(){
  if(CR.length)return;
  try{
    const r=await NF('read',{path:CR_FILE,start:1,max:100000,maxBytes:300000});
    const o=JSON.parse(r.text);
    if(o&&Array.isArray(o.rules)){
      const ok=[];
      for(const x of o.rules.slice(0,CR_MAX)){const v=crValidate(x);if(v.ok){v.rule.id=x.id||('cr'+Date.now().toString(36)+ok.length);v.rule.on=x.on!==false;v.rule.uses=+x.uses||0;v.rule.created=x.created||'';ok.push(v.rule)}}
      if(ok.length){CR=ok;sv(CR_KEY,CR)}
    }
  }catch(e){}
}
try{setTimeout(crRestore,2500)}catch(e){}

// ---------- matching (loose, on the phone, no AI) ----------
const crClean=s=>String(s==null?'':s).toLowerCase().replace(/https?:\/\/\S+/g,' ').replace(/[^\p{L}\p{N}\p{M}]+/gu,' ').trim();
const CR_TC=new Map();
function crTok(s){
  s=String(s==null?'':s);
  const hit=CR_TC.get(s);
  if(hit)return hit;
  const all=crClean(s).split(/\s+/).filter(Boolean),k=all.filter(w=>!CR_STOP.has(w)),out=k.length?k:all;
  if(CR_TC.size>500)CR_TC.clear();
  CR_TC.set(s,out);
  return out;
}
// Edit distance with adjacent swaps counted as one. Gives up (returns max+1) once it is clearly too far.
function crDist(a,b,max){
  if(Math.abs(a.length-b.length)>max)return max+1;
  const al=a.length,bl=b.length;let p2=null,p1=[];
  for(let j=0;j<=bl;j++)p1.push(j);
  for(let i=1;i<=al;i++){
    const c=[i];let mn=i;
    for(let j=1;j<=bl;j++){
      let v=Math.min(p1[j]+1,c[j-1]+1,p1[j-1]+(a[i-1]===b[j-1]?0:1));
      if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])v=Math.min(v,p2[j-2]+1);
      c[j]=v;if(v<mn)mn=v;
    }
    if(mn>max)return max+1;
    p2=p1;p1=c;
  }
  return p1[bl];
}
// 1 = same word, .85 = a typo or a small ending change (playlist / playlst / playlists), 0 = different. Words under 4 letters must be exact.
function crTokScore(a,b){
  if(a===b)return 1;
  const m=Math.min(a.length,b.length);
  if(m<4)return 0;
  if(a[0]!==b[0]&&a[a.length-1]!==b[b.length-1])return 0; // a typo almost never changes both the first and the last letter
  if((a.indexOf(b)===0||b.indexOf(a)===0)&&Math.abs(a.length-b.length)<=3)return .85;
  const d=crDist(a,b,m>=8?2:1);
  if(d<=1)return .85;
  if(d<=2&&m>=8)return .8;
  return 0;
}
// Best trigger of a rule for this message: cov = how much of the trigger is in the message, prec = how much of the message is the trigger.
function crScore(rule,msg){
  const M=crTok(msg);let best=null;
  for(const tr of rule.triggers){
    const T=crTok(tr);
    if(!T.length||!M.length)continue;
    let sum=0;const used=new Set(),hit=[];
    for(const t of T){
      let bs=0,bi=-1;
      M.forEach((m,i)=>{const s=crTokScore(t,m);if(s>bs){bs=s;bi=i}});
      sum+=bs;if(bs>0){used.add(bi);hit.push(t)}
    }
    const cov=sum/T.length,prec=used.size/M.length,score=cov*(0.7+0.3*prec);
    if(!best||score>best.score)best={trig:tr,cov,prec,score,hit,tn:T.length,mn:M.length};
  }
  return best;
}
// auto = run now. ask = "chalau?" confirm card first. none = normal chat. A question, a long message, or auto:false never runs by itself.
function crLevel(rule,b,msg){
  if(!b)return'none';
  const q=/\?\s*$/.test(String(msg==null?'':msg).trim());
  if(b.cov>=.9&&b.mn<=b.tn+4&&b.prec>=(b.tn===1?.99:.5)&&rule.auto!==false&&!q)return'auto';
  if(b.cov>=.9&&b.prec>=.2)return'ask';
  if(b.cov>=.65&&b.prec>=.3)return'ask';
  return'none';
}
function crMatch(msg){
  let best=null;
  for(const r of CR){
    if(!r.on)continue;
    const b=crScore(r,msg),lv=crLevel(r,b,msg);
    if(lv==='none')continue;
    const rank=(lv==='auto'?10:0)+b.score;
    if(!best||rank>best.rank)best=Object.assign({rule:r,level:lv,rank},b);
  }
  return best;
}

// ---------- variables and templates ----------
function crVars(msg){
  const raw=String(msg==null?'':msg),links=(raw.match(CR_URL)||[]).map(u=>u.replace(/[.,;:!?)\]]+$/,''));
  const d=new Date(),p=n=>String(n).padStart(2,'0');
  return{link:links[0]||'',links:links.join(' '),rest:raw.replace(CR_URL,' ').replace(/\s+/g,' ').trim(),msg:raw.trim(),
    date:d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()),time:p(d.getHours())+':'+p(d.getMinutes()),prev:'',name:''};
}
// {rest} when a trigger matched: the message without the URLs and without the words that matched the trigger (and without filler words at its ends).
// "playlist add doodh lao" with trigger "playlist add" -> "doodh lao".
function crRest(msg,trig){
  const T=crTok(trig),words=String(msg==null?'':msg).replace(CR_URL,' ').split(/\s+/).filter(Boolean);
  const keep=words.filter(w=>{const n=crClean(w);if(!n)return false;return!T.some(x=>crTokScore(x,n)>0)});
  const stop=w=>CR_STOP.has(crClean(w));
  while(keep.length&&stop(keep[0]))keep.shift();
  while(keep.length&&stop(keep[keep.length-1]))keep.pop();
  return keep.join(' ');
}
function crFill(s,V,shell){
  return String(s==null?'':s).replace(new RegExp(CR_VARRE,'g'),(m,k)=>{const v=crSafe(V[k]);return shell?shq(v):v});
}
function crFillArgs(tool,args,V){
  const walk=(o,top)=>{
    if(typeof o==='string')return crFill(o,V,false);
    if(Array.isArray(o))return o.map(x=>walk(x,false));
    if(o&&typeof o==='object'){
      const r={};
      for(const k of Object.keys(o))r[k]=(tool==='termux_run'&&top&&k==='command'&&typeof o[k]==='string')?crFill(o[k],V,true):walk(o[k],false);
      return r;
    }
    return o;
  };
  return walk(args||{},true);
}
// {var} placeholders of a termux command that sit inside quotes or after a backslash: the quoted value would break out of its quotes there.
function crShellBad(cmd){
  let sq=false,dq=false,esc=false;const bad=[];
  const ph=i=>new RegExp('^'+CR_VARRE).exec(cmd.slice(i));
  for(let i=0;i<cmd.length;i++){
    const ch=cmd[i];
    if(esc){esc=false;if(ch==='{'){const m=ph(i);if(m)bad.push(m[0])}continue}
    if(ch==='\\'&&!sq){esc=true;continue}
    if(ch==="'"&&!dq){sq=!sq;continue}
    if(ch==='"'&&!sq){dq=!dq;continue}
    if(ch==='{'){const m=ph(i);if(m){if(sq||dq)bad.push(m[0]);i+=m[0].length-1}}
  }
  return bad;
}

// ---------- conditions ----------
const CR_COND_RE=/^(not:\s*)?(ok|fail|has:.+|miss:.+|set:[a-z_][a-z0-9_]*|empty:[a-z_][a-z0-9_]*|eq:[a-z_][a-z0-9_]*=.*)$/i;
function crCondOk(c){
  if(c&&typeof c==='object'&&!Array.isArray(c)){
    const l=Array.isArray(c.all)?c.all:Array.isArray(c.any)?c.any:null;
    return!!l&&l.length>0&&l.length<=5&&l.every(x=>typeof x==='string'&&CR_COND_RE.test(x.trim()));
  }
  return typeof c==='string'&&CR_COND_RE.test(c.trim());
}
function crCond(c,st){
  if(c&&typeof c==='object'){
    if(Array.isArray(c.all))return c.all.every(x=>crCond(x,st));
    if(Array.isArray(c.any))return c.any.some(x=>crCond(x,st));
    return false;
  }
  let s=String(c||'').trim(),neg=false;
  if(/^not:/i.test(s)){neg=true;s=s.slice(4).trim()}
  const last=st.last,low=x=>String(x==null?'':x).toLowerCase(),V=st.V;let r=false;
  if(/^ok$/i.test(s))r=!!(last&&last.ok);
  else if(/^fail$/i.test(s))r=!!(last&&!last.ok);
  else if(/^has:/i.test(s))r=!!last&&low(last.text).indexOf(low(crFill(s.slice(4),V,false)))>=0;
  else if(/^miss:/i.test(s))r=!last||low(last.text).indexOf(low(crFill(s.slice(5),V,false)))<0;
  else if(/^set:/i.test(s))r=!!String(V[s.slice(4).trim()]||'').trim();
  else if(/^empty:/i.test(s))r=!String(V[s.slice(6).trim()]||'').trim();
  else if(/^eq:/i.test(s)){const i=s.indexOf('=');if(i>0)r=low(V[s.slice(3,i).trim()]||'')===low(crFill(s.slice(i+1),V,false)).trim()}
  return neg?!r:r;
}

// ---------- validation (one place for AI-made and restored rules) ----------
function crValidate(o,toolNames){
  const errs=[],names=toolNames||TOOLS.map(t=>t.function.name);
  o=o&&typeof o==='object'?o:{};
  const r={id:'',name:crSlug(o.name),on:true,triggers:[],need:[],steps:[],auto:o.auto!==false,created:'',uses:0,last:''};
  if(!r.name)errs.push('name chahiye (a-z, 0-9, _).');
  const tr=Array.isArray(o.triggers)?o.triggers:(typeof o.triggers==='string'?[o.triggers]:[]);
  r.triggers=tr.map(x=>String(x==null?'':x).replace(/\s+/g,' ').trim().slice(0,60)).filter(Boolean).slice(0,8);
  if(!r.triggers.length)errs.push('triggers chahiye (1 se 8 chhote phrase ya keywords).');
  r.triggers.forEach(t=>{if(!crTok(t).length)errs.push('trigger me koi shabd nahi: "'+t+'"')});
  r.need=[...new Set((Array.isArray(o.need)?o.need:[]).map(x=>String(x).toLowerCase()))];
  r.need.forEach(x=>{if(CR_NEED.indexOf(x)<0)errs.push('need me sirf link ya rest chalta hai: '+x)});
  const defs=new Set();let count=0;
  const stepList=(list,depth,path)=>{
    if(!Array.isArray(list)||!list.length){errs.push(path+': steps ki list chahiye.');return[]}
    const out=[];
    list.forEach((s,i)=>{const c=oneStep(s,depth,path+(path?'.':'')+(i+1));if(c)out.push(c)});
    return out;
  };
  const oneStep=(s,depth,at)=>{
    if(!s||typeof s!=='object'||Array.isArray(s)){errs.push('step '+at+': object hona chahiye.');return null}
    if(++count>CR_MAX_STEPS){if(count===CR_MAX_STEPS+1)errs.push('Max '+CR_MAX_STEPS+' steps.');return null}
    const d=String(s.do||'').toLowerCase();
    if(d==='tool'){
      const tool=String(s.tool||'');
      if(names.indexOf(tool)<0){errs.push('step '+at+': tool "'+tool+'" nahi mila.');return null}
      if(CR_NOTOOL.indexOf(tool)>=0){errs.push('step '+at+': '+tool+' rule ke andar nahi chal sakta.');return null}
      const args=s.args&&typeof s.args==='object'&&!Array.isArray(s.args)?s.args:{};
      if(JSON.stringify(args).length>3000){errs.push('step '+at+': args bahut bade (max 3000).');return null}
      if(tool==='termux_run'){
        const c=args.command;
        if(typeof c!=='string'||!c.trim())errs.push('step '+at+': termux_run ko command chahiye.');
        else crShellBad(c).forEach(v=>errs.push('step '+at+': '+v+' quotes ke andar ya backslash ke baad hai. Quotes hatao, app khud quote lagata hai.'));
      }
      let as='';
      if(s.as!=null&&s.as!==''){as=crVarName(s.as);if(!as||CR_BUILTIN.indexOf(as)>=0)errs.push('step '+at+': "as" naam sahi nahi ('+s.as+').');else defs.add(as)}
      return{do:'tool',tool,args,as:as||undefined,onfail:s.onfail==='continue'?'continue':'stop'};
    }
    if(d==='reply'){
      const t=String(s.text==null?'':s.text);
      if(!t.trim()||t.length>1000){errs.push('step '+at+': reply text 1 se 1000 chars ka chahiye.');return null}
      return{do:'reply',text:t};
    }
    if(d==='set'){
      const v=crVarName(s.var);
      if(!v||CR_BUILTIN.indexOf(v)>=0){errs.push('step '+at+': set ka var naam sahi nahi.');return null}
      defs.add(v);
      return{do:'set',var:v,value:String(s.value==null?'':s.value).slice(0,500)};
    }
    if(d==='stop')return{do:'stop',text:String(s.text==null?'':s.text).slice(0,1000)};
    if(d==='if'){
      if(depth>=CR_DEPTH){errs.push('step '+at+': if ke andar if max '+CR_DEPTH+' level tak.');return null}
      if(!crCondOk(s.cond)){errs.push('step '+at+': cond sahi nahi (ok, fail, has:TEXT, miss:TEXT, set:VAR, empty:VAR, eq:VAR=VALUE, not:COND).');return null}
      const th=stepList(s.then,depth+1,at+'.then');
      const el=s.else==null||(Array.isArray(s.else)&&!s.else.length)?[]:stepList(s.else,depth+1,at+'.else');
      return{do:'if',cond:s.cond,then:th,else:el};
    }
    errs.push('step '+at+': do ko tool, reply, set, if ya stop hona chahiye ('+d+').');
    return null;
  };
  r.steps=stepList(o.steps,0,'');
  const js=JSON.stringify(r.steps);
  if(js.length>CR_MAX_JSON)errs.push('Rule bahut bada (max '+CR_MAX_JSON+' chars).');
  const known=new Set(CR_BUILTIN.concat([...defs])),seen=new Set();
  for(const m of js.matchAll(new RegExp(CR_VARRE,'g')))if(!known.has(m[1])&&!seen.has(m[1])){seen.add(m[1]);errs.push('variable {'+m[1]+'} define nahi hai (builtin: '+CR_BUILTIN.join(', ')+'; ya "as"/set se banao).')}
  return{ok:!errs.length,errs,rule:r};
}

// ---------- show a rule in plain text ----------
function crViewSteps(list,ind,out,n){
  const pad=' '.repeat(ind);
  list.forEach(s=>{
    if(s.do==='tool'){
      const a=s.tool==='termux_run'?String(s.args.command||''):cut(JSON.stringify(s.args),140);
      out.push(pad+(++n.i)+'. '+s.tool+': '+cut(a,160)+(s.as?'  -> {'+s.as+'}':'')+(s.onfail==='continue'?'  (fail ho to bhi aage)':''));
    }else if(s.do==='reply')out.push(pad+(++n.i)+'. bolo: '+cut(s.text,120));
    else if(s.do==='set')out.push(pad+(++n.i)+'. {'+s.var+'} = '+cut(s.value,80));
    else if(s.do==='stop')out.push(pad+(++n.i)+'. ruko'+(s.text?': '+cut(s.text,100):''));
    else if(s.do==='if'){
      out.push(pad+(++n.i)+'. agar '+(typeof s.cond==='string'?s.cond:JSON.stringify(s.cond))+':');
      crViewSteps(s.then,ind+3,out,n);
      if(s.else&&s.else.length){out.push(pad+'   warna:');crViewSteps(s.else,ind+3,out,n)}
    }
  });
}
function crView(r){
  const out=[r.name+(r.on===false?'  [off]':'')+(r.auto===false?'  [hamesha poochega]':''),'jab: '+r.triggers.map(t=>'"'+t+'"').join(' | ')];
  if(r.need&&r.need.length)out.push('chahiye: '+r.need.join(', '));
  crViewSteps(r.steps,0,out,{i:0});
  return out.join('\n');
}

// ---------- running ----------
async function crClip(){
  try{
    const r=await NT('run',{command:'timeout 8 termux-clipboard-get',timeout:12});
    const m=String(r&&r.stdout||'').match(/https?:\/\/[^\s<>"'`]+/i);
    return m?m[0].replace(/[.,;:!?)\]]+$/,''):'';
  }catch(e){return''}
}
async function crExec(list,st,depth){
  for(const s of list){
    if(st.tn.stop){st.stop='user';return}
    if(++st.n>CR_RUN_CAP){st.fail='Step limit ('+CR_RUN_CAP+') ho gayi, rule roka.';return}
    if(s.do==='tool'){
      const args=crFillArgs(s.tool,s.args,st.V);
      st.tn.tool=s.tool;LAST_TOOL_BAD=false;
      let res;
      try{res=await execTool(s.tool,args,st.steps)}catch(e){res='Fail: '+errMsg(e);LAST_TOOL_BAD=true}
      const bad=LAST_TOOL_BAD;st.tn.tool='';st.k++;
      const txt=String(res==null?'':res);
      st.last={ok:!bad,text:txt};st.V.prev=txt;
      if(s.as)st.V[s.as]=txt;
      if(st.tn.stop||SCR_STOP){st.stop='user';return}
      if(bad&&s.onfail!=='continue'){st.fail='Step '+st.k+' ('+s.tool+') fail hua: '+cut(txt.replace(/\s+/g,' '),220);return}
    }else if(s.do==='reply')st.out.push(crFill(s.text,st.V,false));
    else if(s.do==='set')st.V[s.var]=crFill(s.value,st.V,false);
    else if(s.do==='stop'){if(s.text)st.out.push(crFill(s.text,st.V,false));st.stop='step';return}
    else if(s.do==='if'){
      await crExec(crCond(s.cond,st)?s.then:(s.else||[]),st,depth+1);
      if(st.fail||st.stop)return;
    }
  }
}
async function crRun(rule,msg,opt){
  const tn=TURN||{stop:false},steps=[],out=[],V=crVars(msg),t0=Date.now();
  V.name=rule.name;
  if(opt&&opt.trig)V.rest=crRest(msg,opt.trig);
  if((rule.need||[]).indexOf('link')>=0&&!V.link){
    const c=await crClip();
    if(c){V.link=c;V.links=c;steps.push('Link clipboard se liya')}
  }
  const miss=[];
  if((rule.need||[]).indexOf('link')>=0&&!V.link)miss.push('link (message me ya clipboard me)');
  if((rule.need||[]).indexOf('rest')>=0&&!V.rest)miss.push('text');
  if(miss.length){logAdd('rule',rule.name+': '+miss.join(', ')+' nahi mila');return{content:'Rule "'+rule.name+'" ko '+miss.join(' aur ')+' chahiye. Wo bhejke dobara bolo.',by:'Rule',steps}}
  FILE_TURN={w:'',p:{}};SCR_STOP=false;LEFT_APP=false;PILL_ERR='';NS('reset').catch(()=>{});
  lnSet('Rule chal raha hai: '+rule.name,'run');
  logAdd('rule','run '+rule.name+' ('+((opt&&opt.via)||'?')+')');
  const st={last:null,n:0,k:0,tn,out,steps,V,fail:'',stop:''};
  try{await crExec(rule.steps,st,0)}catch(e){st.fail='Rule me error: '+errMsg(e)}
  rule.uses=(rule.uses||0)+1;rule.last=new Date().toISOString();crPersist(false);
  if(typeof autoPresent==='function'){try{await autoPresent()}catch(e){}}
  if(steps.length&&LEFT_APP)NS('finish').catch(()=>{});else NS('finish',{open:false}).catch(()=>{});
  logAdd('rule',rule.name+': '+(st.stop==='user'?'stop':st.fail?'FAIL':'ok')+' ('+(Date.now()-t0)+' ms, '+st.k+' tool steps)');
  let content;
  if(st.stop==='user')content='Stop dabaya gaya, rule "'+rule.name+'" beech me ruk gaya.';
  else if(st.fail)content='Rule "'+rule.name+'" ruk gaya.\n'+st.fail+(out.length?'\n\n'+out.join('\n\n'):'');
  else content=out.length?out.join('\n\n'):'Rule "'+rule.name+'" ho gaya ('+st.k+' step).';
  return{content,by:'Rule: '+rule.name,steps};
}
// Called for every plain chat message before the AI. null = no rule matched (or he said no): the message goes to the AI as usual.
async function crTry(t){
  let m=null;
  try{if(CR.some(r=>r.on))m=crMatch(t)}catch(e){logAdd('rule','match error: '+errMsg(e))}
  if(!m||m.level==='none')return null;
  logAdd('rule','match '+m.rule.name+' '+m.level+' '+Math.round(m.score*100)+'%');
  if(m.level==='ask'){
    const ok=await tconfirm('Ye rule chalau? ('+m.rule.name+')',crView(m.rule),['tera message is rule se milta hai ('+Math.round(m.score*100)+'%)'],'Chalao','Rule');
    if(!ok){logAdd('rule','ask: nahi, normal chat');return null}
  }
  return await crRun(m.rule,t,{via:m.level,trig:m.trig});
}

// ---------- AI tools ----------
async function crTool(name,a,note,fl){
  const bad=s=>{fl.bad=true;return note(s)};
  if(name==='rule_list'){
    if(!CR.length)return note('Koi rule nahi hai.');
    return note(CR.length+' rule hain.')+'\n'+CR.map(r=>r.name+(r.on?'':' (off)')+': '+r.triggers.map(t=>'"'+t+'"').join(' | ')).join('\n');
  }
  const v=crValidate(a);
  if(!v.ok)return bad('Rule me galti: '+v.errs.slice(0,6).join(' | ')+'. Sahi karke dobara rule_save chalao.');
  const old=CR.find(x=>x.name===v.rule.name);
  if(!old&&CR.length>=CR_MAX)return bad('Max '+CR_MAX+' rules ho chuke. Najeef /rule del se kuch hataye.');
  const ok=await tconfirm((old?'Rule update karu':'Naya rule save karu')+'? ('+v.rule.name+')',crView(v.rule),['AI ne ye rule banaya. Tere Allow ke bina save nahi hota.'],'Save karo','Rule');
  if(!ok){fl.bad=true;return note('Najeef ne rule cancel kiya.')+' Dobara mat save karo, pucho kya badalna hai.'}
  const r=v.rule;
  r.id=old?old.id:'cr'+Date.now().toString(36);
  r.created=old?old.created:new Date().toISOString();
  r.uses=old?old.uses:0;
  r.on=old?old.on:true;
  if(old)CR[CR.indexOf(old)]=r;else CR.push(r);
  crPersist();
  return note('Rule save ho gaya: '+r.name)+' Ab "'+r.triggers[0]+'" jaisa kuch bolne par chalega. Najeef /rule list se dekh sakta hai.';
}

// ---------- /rule ----------
function crFind(q){
  q=String(q||'').trim();
  if(!q)return null;
  if(/^\d+$/.test(q))return CR[+q-1]||null;
  const s=crSlug(q),e=CR.find(x=>x.name===s);
  if(e)return e;
  const c=CR.filter(x=>x.name.indexOf(s)===0);
  return c.length===1?c[0]:null;
}
async function ruleCmd(arg){
  const say=(c,x)=>H.push(Object.assign({role:'assistant',by:'Rule',info:1,content:c},x||{}));
  arg=String(arg||'').trim();
  const m=/^(\S+)\s*([\s\S]*)$/.exec(arg),sub=(m?m[1]:'').toLowerCase(),rest=m?m[2].trim():'';
  try{
    if(!sub||sub==='list'||sub==='ls'){
      if(!CR.length){say('Abhi koi rule nahi hai.\n\n'+CR_HELP);return}
      say(CR.map((r,i)=>(i+1)+'. '+(r.on?'':'[off] ')+r.name+': '+r.triggers.slice(0,3).map(t=>'"'+t+'"').join(' | ')+(r.triggers.length>3?' +'+(r.triggers.length-3):'')+(r.uses?'  ('+r.uses+' baar chala)':'')).join('\n')+'\n\n/rule show <no> se steps dekho.');
      return;
    }
    if(sub==='help'||sub==='?'){say(CR_HELP);return}
    if(sub==='test'){
      if(!rest){say('Aisa likho: /rule test <jo tu chat me bolta>');return}
      if(!CR.length){say('Abhi koi rule nahi hai.');return}
      const lines=[];let top=null;
      for(const r of CR){
        const b=crScore(r,rest),lv=r.on?crLevel(r,b,rest):'off';
        lines.push(r.name+': '+(lv==='off'?'off hai':b?(lv==='auto'?'SEEDHA':lv==='ask'?'poochega':'nahi')+' '+Math.round(b.score*100)+'% (mila: '+(b.hit.join(', ')||'-')+')':'milta nahi'));
      }
      const mm=crMatch(rest);
      say('Message: "'+cut(rest,80)+'"\n'+lines.join('\n')+'\n\n'+(mm?'Chalega: '+mm.rule.name+(mm.level==='auto'?' (seedha)':' (pehle poochega)'):'Koi rule nahi lagega, normal chat.'));
      return;
    }
    if(sub==='run'){
      const m2=/^(\S+)\s*([\s\S]*)$/.exec(rest);
      const r=m2?crFind(m2[1]):null;
      if(!r){say('Rule nahi mila. /rule list dekho.');return}
      const res=await crRun(r,m2[2]||'',{via:'run'});
      H.push({role:'assistant',content:res.content,by:res.by,steps:res.steps});
      return;
    }
    if(['show','view','on','off','del','rm','delete'].indexOf(sub)>=0){
      const r=crFind(rest);
      if(!r){say('Rule nahi mila: '+(rest||'(naam ya number do)')+'. /rule list dekho.');return}
      if(sub==='show'||sub==='view'){say(crView(r)+'\n\n'+(r.uses?r.uses+' baar chala. ':'')+(r.last?'Aakhri: '+r.last.slice(0,16).replace('T',' '):''));return}
      if(sub==='on'||sub==='off'){r.on=sub==='on';crPersist();say('Rule "'+r.name+'" ab '+(r.on?'on':'off')+' hai.');return}
      CR=CR.filter(x=>x!==r);crPersist();say('Rule "'+r.name+'" hata diya.');return;
    }
    say('Samajh nahi aaya.\n\n'+CR_HELP);
  }catch(e){say('Command fail: '+errMsg(e))}
}
