// Step23.1: custom rules, the simple way. A rule = name + when (plain text) + steps (plain text).
// Normal messages go to the AI as always. A message that starts with /rule goes to the AI the same way, but with ALL of Najeef's enabled rules added
// to its instructions (crBlock), so it follows the rule that fits his message with its normal tools. No matching code, no step engine.
// Safety is unchanged: the AI uses the usual tools, so face lock and the confirm cards (SMS, call, risky Termux commands) still apply.
// Made by telling the AI (tool rule_save, saved only after Najeef taps Allow). Managed with /rules (list, show, on, off, del).
// Next (3b/3c, not here): time triggers and background runs, an AI step for notifications, creating a rule by typing it.
const CR_KEY='nap_rules',CR_FILE=WS_ROOT+'/rules.json';
const CR_MAX=20,CR_WHEN_MAX=400,CR_STEPS_MAX=1500,CR_BLOCK_MAX=14000;
let CR=ld(CR_KEY,[]);
if(!Array.isArray(CR))CR=[];
const CR_HELP='Custom rules:\n'
  +'/rule <message>   AI tera message aur tere saare rules dekhta hai. Example: /rule isko playlist me add kar <link>\n'
  +'Bina /rule ke normal chat hota hai, rules nahi lagte.\n\n'
  +'Rule banane ke liye AI ko bolo: "iska rule bana: jab main ... bolu to ..." (card me Allow karna padega).\n\n'
  +'/rules   /rules show <no|naam>   /rules on|off <no|naam>   /rules del <no|naam>';
TOOLS.push(
  fn('rule_save','Save or update one of Najeef\'s custom rules. Call it when he says things like "iska rule bana" or "jab main X bolu to Y karna". He must tap Allow on a confirm card, you cannot save without it. First call rules_read with area myrules. name = short (a-z, 0-9, _). when = when the rule applies: one or two sentences plus 2 to 4 example phrases he would type (max 400 chars). steps = short numbered plain steps written for an AI that has the usual tools: name the tool and the exact values, and say what to do if a step fails (max 1500 chars). Another AI turn will follow these steps later, so write them completely.',{name:{type:'string'},when:{type:'string'},steps:{type:'string'}},['name','when','steps']),
  fn('rule_list','List Najeef\'s custom rules (name, on or off, when).',{})
);
const crSlug=s=>String(s==null?'':s).toLowerCase().replace(/[^a-z0-9_-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,40);
function crPersist(mirror){
  sv(CR_KEY,CR);
  if(mirror!==false){try{NF('write',{path:CR_FILE,content:JSON.stringify({v:2,rules:CR},null,1),backup:false}).catch(()=>{})}catch(e){}}
}
// Text from the AI or from an older file: a string, or a list of lines. Keeps line breaks, trims, no limits applied here.
const crText=v=>(Array.isArray(v)?v.map(x=>String(x==null?'':x)).join('\n'):String(v==null?'':v)).replace(/\r/g,'').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();
function crCheck(o){
  o=o&&typeof o==='object'?o:{};
  const errs=[],name=crSlug(o.name),when=crText(o.when),steps=crText(o.steps);
  if(!name)errs.push('name chahiye (a-z, 0-9, _).');
  if(when.length<3)errs.push('when chahiye (rule kab lagta hai, 2 se 4 example phrase ke saath).');
  else if(when.length>CR_WHEN_MAX)errs.push('when bahut lamba ('+when.length+', max '+CR_WHEN_MAX+').');
  if(steps.length<5)errs.push('steps chahiye (numbered plain steps).');
  else if(steps.length>CR_STEPS_MAX)errs.push('steps bahut lambe ('+steps.length+', max '+CR_STEPS_MAX+').');
  return{ok:!errs.length,errs,rule:{id:'',name,on:true,when,steps,created:'',uses:0,last:''}};
}
// ---- older rules (v1.30000.0 had triggers + a list of step objects): turn them into plain text once ----
const crVarWord=s=>String(s==null?'':s).replace(/\{link\}/g,'<link>').replace(/\{links\}/g,'<links>').replace(/\{rest\}/g,'<text>').replace(/\{msg\}/g,'<message>');
function crCondText(c){
  if(c&&typeof c==='object'){const l=Array.isArray(c.all)?c.all:Array.isArray(c.any)?c.any:[];return l.map(crCondText).join(Array.isArray(c.all)?' aur ':' ya ')}
  let s=String(c||'').trim(),neg='';
  if(/^not:/i.test(s)){neg='nahi ';s=s.slice(4).trim()}
  if(/^ok$/i.test(s))return neg+'pichla step chal gaya';
  if(/^fail$/i.test(s))return neg+'pichla step fail hua';
  if(/^has:/i.test(s))return neg+'pichle result me "'+s.slice(4)+'" hai';
  if(/^miss:/i.test(s))return neg+'pichle result me "'+s.slice(5)+'" nahi hai';
  return neg+s;
}
function crOldSteps(list,ind,n){
  const pad=' '.repeat(ind),out=[];
  (Array.isArray(list)?list:[]).forEach(s=>{
    if(!s||typeof s!=='object')return;
    if(s.do==='tool'){
      const a=s.tool==='termux_run'&&s.args&&s.args.command?String(s.args.command):JSON.stringify(s.args||{});
      out.push(pad+(++n.i)+'. '+s.tool+' chalao: '+crVarWord(a)+(s.onfail==='continue'?' (fail ho to bhi aage badho)':' (fail ho to ruk jao)'));
    }else if(s.do==='reply')out.push(pad+(++n.i)+'. Najeef ko bolo: '+crVarWord(s.text));
    else if(s.do==='stop')out.push(pad+(++n.i)+'. Ruk jao'+(s.text?' aur bolo: '+crVarWord(s.text):''));
    else if(s.do==='set')out.push(pad+(++n.i)+'. Yaad rakho: '+s.var+' = '+crVarWord(s.value));
    else if(s.do==='if'){
      out.push(pad+(++n.i)+'. Agar '+crCondText(s.cond)+':');
      out.push(crOldSteps(s.then,ind+3,n));
      if(s.else&&s.else.length){out.push(pad+'   Warna:');out.push(crOldSteps(s.else,ind+3,n))}
    }
  });
  return out.filter(Boolean).join('\n');
}
function crMigrate(r){
  if(!r||typeof r!=='object')return null;
  let o=r;
  if(Array.isArray(r.steps)||Array.isArray(r.triggers)){
    const tr=(Array.isArray(r.triggers)?r.triggers:[]).map(x=>'"'+x+'"').join(' | ');
    o={name:r.name,when:'Jab Najeef kuch aisa bole: '+tr+((r.need||[]).indexOf('link')>=0?' (message me link hona chahiye)':''),steps:crOldSteps(r.steps,0,{i:0})};
  }
  const v=crCheck(o);
  if(!v.ok)return null;
  const x=v.rule;
  x.id=String(r.id||'cr'+Date.now().toString(36));x.on=r.on!==false;x.created=r.created||'';x.uses=+r.uses||0;x.last=r.last||'';
  return x;
}
{
  const before=JSON.stringify(CR);
  CR=CR.map(crMigrate).filter(Boolean).slice(0,CR_MAX);
  if(CR.length&&JSON.stringify(CR)!==before)sv(CR_KEY,CR);
}
// If the phone's own copy is empty (app data cleared) but /sdcard/Chaman/rules.json exists, take the rules back from it.
async function crRestore(){
  if(CR.length)return;
  try{
    const r=await NF('read',{path:CR_FILE,start:1,max:100000,maxBytes:300000});
    const o=JSON.parse(r.text);
    if(o&&Array.isArray(o.rules)){
      const ok=o.rules.slice(0,CR_MAX).map(crMigrate).filter(Boolean);
      if(ok.length){CR=ok;sv(CR_KEY,CR)}
    }
  }catch(e){}
}
try{setTimeout(crRestore,2500)}catch(e){}

// ---------- what the AI gets in a /rule message ----------
function crView(r){
  return r.name+(r.on===false?'  [off]':'')+'\njab: '+r.when+'\nsteps:\n'+r.steps;
}
function crBlock(){
  if(!(typeof TURN!=='undefined'&&TURN&&TURN.rule))return'';
  const on=CR.filter(r=>r.on);
  let out='\n\nCUSTOM RULES: Najeef started this message with /rule, so he wants his own rules used.';
  if(!on.length){
    logAdd('rules','custom: koi rule nahi');
    return out+' He has no custom rules (turned on) yet. Answer his message normally, and tell him in one short line that he has no rule yet; he can make one by telling you "iska rule bana ..." (then call rules_read myrules and rule_save).';
  }
  out+=' Below are his rules. If his message fits the "when" of a rule, do that rule\'s steps in order with your tools (all the usual safety rules, confirm cards and face lock apply). If a step fails, do what the rule says for that case, otherwise stop and tell him which step failed. Use the values from his message (a link = the URL in it; if the rule needs a link and there is none, ask him for it). In a Termux command put every value from his message inside single quotes and never paste his raw text into a command. If no rule fits, answer his message normally and say in one short line that no rule matched. Do not invent rules, do not mix the steps of different rules, and do not save or change a rule unless he asks.';
  let used=0;
  for(const r of on){
    const t='\n\nRULE '+(used+1)+': '+r.name+'\nwhen: '+r.when+'\nsteps:\n'+r.steps;
    if((out+t).length>CR_BLOCK_MAX){out+='\n\n(Baaki '+(on.length-used)+' rules jagah ki wajah se nahi diye.)';break}
    out+=t;used++;
  }
  logAdd('rules','custom: '+used+' rules');
  return out;
}

// ---------- AI tools ----------
async function crTool(name,a,note,fl){
  const bad=s=>{fl.bad=true;return note(s)};
  if(name==='rule_list'){
    if(!CR.length)return note('Koi rule nahi hai.');
    return note(CR.length+' rule hain.')+'\n'+CR.map(r=>r.name+(r.on?'':' (off)')+': '+cut(r.when.replace(/\s+/g,' '),120)).join('\n');
  }
  const v=crCheck(a);
  if(!v.ok)return bad('Rule me galti: '+v.errs.join(' | ')+'. Sahi karke dobara rule_save chalao.');
  const old=CR.find(x=>x.name===v.rule.name);
  if(!old&&CR.length>=CR_MAX)return bad('Max '+CR_MAX+' rules ho chuke. Najeef /rules del se kuch hataye.');
  const ok=await tconfirm((old?'Rule update karu':'Naya rule save karu')+'? ('+v.rule.name+')',crView(v.rule),['AI ne ye rule banaya. Tere Allow ke bina save nahi hota.'],'Save karo','Rule');
  if(!ok){fl.bad=true;return note('Najeef ne rule cancel kiya.')+' Dobara mat save karo, pucho kya badalna hai.'}
  const r=v.rule;
  r.id=old?old.id:'cr'+Date.now().toString(36);
  r.created=old?old.created:new Date().toISOString();
  r.uses=old?old.uses:0;
  r.on=old?old.on:true;
  if(old)CR[CR.indexOf(old)]=r;else CR.push(r);
  crPersist();
  return note('Rule save ho gaya: '+r.name)+' Ab Najeef "/rule ..." likhke isse chalwa sakta hai. /rules se dekh sakta hai.';
}

// ---------- /rules (manage) and /rule with nothing after it (help) ----------
function crFind(q){
  q=String(q||'').trim();
  if(!q)return null;
  if(/^\d+$/.test(q))return CR[+q-1]||null;
  const s=crSlug(q),e=CR.find(x=>x.name===s);
  if(e)return e;
  const c=CR.filter(x=>x.name.indexOf(s)===0);
  return c.length===1?c[0]:null;
}
function ruleHelp(){H.push({role:'assistant',by:'Rule',info:1,content:CR_HELP})}
async function rulesCmd(arg){
  const say=c=>H.push({role:'assistant',by:'Rule',info:1,content:c});
  arg=String(arg||'').trim();
  const m=/^(\S+)\s*([\s\S]*)$/.exec(arg),sub=(m?m[1]:'').toLowerCase(),rest=m?m[2].trim():'';
  try{
    if(!sub||sub==='list'||sub==='ls'){
      if(!CR.length){say('Abhi koi rule nahi hai.\n\n'+CR_HELP);return}
      say(CR.map((r,i)=>(i+1)+'. '+(r.on?'':'[off] ')+r.name+': '+cut(r.when.replace(/\s+/g,' '),90)+(r.uses?'  ('+r.uses+' baar)':'')).join('\n')+'\n\n/rules show <no> se poora rule dekho.');
      return;
    }
    if(sub==='help'||sub==='?'){say(CR_HELP);return}
    if(['show','view','on','off','del','rm','delete'].indexOf(sub)>=0){
      const r=crFind(rest);
      if(!r){say('Rule nahi mila: '+(rest||'(naam ya number do)')+'. /rules se list dekho.');return}
      if(sub==='show'||sub==='view'){say(crView(r)+(r.uses?'\n\n'+r.uses+' baar chala.':''));return}
      if(sub==='on'||sub==='off'){r.on=sub==='on';crPersist();say('Rule "'+r.name+'" ab '+(r.on?'on':'off')+' hai.');return}
      CR=CR.filter(x=>x!==r);crPersist();say('Rule "'+r.name+'" hata diya.');return;
    }
    say('Samajh nahi aaya.\n\n'+CR_HELP);
  }catch(e){say('Command fail: '+errMsg(e))}
}
