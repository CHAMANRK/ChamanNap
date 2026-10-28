// Step12: notes. Najeef's text that must come back exactly (a command, link, snippet), kept in /sdcard/Chaman/notes/<slug>.md.
// The APP finds and shows a note (/note, /n, or the note_get tool), so the AI can never rewrite it.
// AI tools: note_save (text must be in Najeef's own message) and note_get (the app shows the card; the AI never gets the text).
const NOTE_DIR=WS_ROOT+'/notes';
let NOTE_C={t:0,list:[]},NOTE_LAST=[];
TOOLS.push(
  fn('note_save','Save text that Najeef gave you in his message and wants back later exactly as it is (a command, link, snippet, number). name = short name he will ask for, for example "update command". text = copy his text exactly, do not change or shorten it (without the surrounding backticks). Use this, not memory_save, for such things. If you wrote the text yourself set from_ai=true. An existing name is not replaced unless overwrite=true.',{name:{type:'string'},text:{type:'string'},tags:{type:'array',items:{type:'string'},description:'optional other words he may use to ask for it'},from_ai:{type:'boolean'},overwrite:{type:'boolean'}},['name','text']),
  fn('note_get','Find one of Najeef\'s saved notes (see note_save) and show it to him. Call it when he asks for something he had you save ("update command do"). The app shows the note card itself, you never receive the text and must not write it yourself. query = his words for it; empty = list of notes.',{query:{type:'string'}})
);
const noteSlug=n=>String(n||'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'-').replace(/^-+|-+$/g,'').slice(0,40)||'note';
const noteName=n=>String(n==null?'':n).replace(/\s+/g,' ').trim().slice(0,60);
const noteTags=t=>(Array.isArray(t)?t:String(t||'').split(',')).map(x=>noteName(x).toLowerCase()).filter(Boolean).slice(0,8);
const notePath=slug=>NOTE_DIR+'/'+slug+'.md';
function noteSer(r){
  const d=new Date(),p=n=>String(n).padStart(2,'0');
  return'# '+r.name+'\ntags: '+(r.tags||[]).join(', ')+'\nsource: '+(r.src==='ai'?'ai':'user')+'\ncreated: '+(r.created||d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes()))+'\n---\n'+r.body;
}
function noteParse(txt,slug){
  const i=txt.indexOf('\n---\n');if(i<0)return null;
  const head=txt.slice(0,i).split('\n'),r={slug,name:slug,tags:[],src:'user',created:'',body:txt.slice(i+5)};
  head.forEach(l=>{
    if(l.indexOf('# ')===0)r.name=l.slice(2).trim()||slug;
    else if(l.indexOf('tags:')===0)r.tags=noteTags(l.slice(5));
    else if(l.indexOf('source:')===0)r.src=l.slice(7).trim()==='ai'?'ai':'user';
    else if(l.indexOf('created:')===0)r.created=l.slice(8).trim();
  });
  return r;
}
async function loadNotes(force){
  if(!force&&Date.now()-NOTE_C.t<20000)return NOTE_C.list;
  let items=[];
  try{items=(await NF('list',{path:NOTE_DIR})).items||[]}catch(e){if(e&&e.code==='NOT_FOUND'){NOTE_C={t:Date.now(),list:[]};return[]}throw e}
  const fs=items.filter(x=>!x.dir&&/\.md$/.test(x.name)),out=[];
  for(let i=0;i<fs.length;i+=10){
    const part=await Promise.all(fs.slice(i,i+10).map(x=>NF('read',{path:NOTE_DIR+'/'+x.name,start:1,max:100000,maxBytes:200000}).then(r=>noteParse(r.text,x.name.replace(/\.md$/,''))).catch(()=>null)));
    part.forEach(r=>{if(r)out.push(r)});
  }
  out.sort((a,b)=>a.name.localeCompare(b.name));
  NOTE_C={t:Date.now(),list:out};return out;
}
// ---- search (done by the app: names, tags and the start of the text; small typos are fine) ----
const NOTE_STOP=new Set(['de','do','dena','dikha','dikhao','bata','batao','ka','ki','ke','ko','wala','wali','mujhe','please','pls','note','notes','the','kya','hai','mera','meri','apna']);
const noteTok=s=>String(s||'').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
function lev(a,b){
  if(Math.abs(a.length-b.length)>1)return 9;
  const d=[];for(let i=0;i<=a.length;i++){d[i]=[i]}for(let j=1;j<=b.length;j++)d[0][j]=j;
  for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
  return d[a.length][b.length];
}
function noteScore(r,tk){
  const nt=noteTok(r.name),tg=noteTok((r.tags||[]).join(' ')),bl=String(r.body||'').slice(0,400).toLowerCase();
  let s=0,m=0;
  for(const t of tk){
    let w=0;
    if(nt.includes(t))w=3;
    else if(nt.some(x=>x.indexOf(t)===0||(t.length>=3&&x.indexOf(t)>=0)))w=2;
    else if(tg.includes(t))w=2.5;
    else if(tg.some(x=>x.indexOf(t)===0))w=1.5;
    else if(t.length>=5&&nt.concat(tg).some(x=>lev(x,t)<=1))w=2;
    else if(t.length>=3&&bl.indexOf(t)>=0)w=1;
    if(w){s+=w;m++}
  }
  return{r,s:s+(m===tk.length?2:0),all:m===tk.length,m};
}
// -> {kind:'none'|'one'|'many', rec, list}
async function noteFind(q){
  const all=await loadNotes();q=String(q||'').trim();
  const h=q.match(/^#(\d+)$/);
  if(h){const sl=NOTE_LAST[+h[1]-1],r=all.find(x=>x.slug===sl);return r?{kind:'one',rec:r}:{kind:'none',list:all}}
  if(!q)return{kind:all.length?'many':'none',list:all};
  const ex=all.find(x=>x.slug===noteSlug(q));if(ex)return{kind:'one',rec:ex};
  let tk=noteTok(q).filter(t=>!NOTE_STOP.has(t));if(!tk.length)tk=noteTok(q);
  const sc=all.map(r=>noteScore(r,tk)).filter(x=>x.m>0).sort((a,b)=>b.s-a.s);
  if(!sc.length)return{kind:'none',list:all};
  if(sc.length===1||(sc[0].all&&!sc[1].all)||(sc[0].all&&sc[1].all&&sc[0].s>=sc[1].s*1.5))return{kind:'one',rec:sc[0].r};
  return{kind:'many',list:sc.slice(0,8).map(x=>x.r)};
}
// ---- save / delete ----
async function noteSave(o){
  const name=noteName(o.name),body=String(o.text==null?'':o.text).replace(/\r\n/g,'\n').replace(/^\n+|\s+$/g,'');
  if(!name)throw Object.assign(new Error('Note ka naam chahiye.'),{code:'NAME'});
  if(!body)throw Object.assign(new Error('Note ka text khaali hai.'),{code:'EMPTY'});
  if(body.length>50000)throw Object.assign(new Error('Note bahut bada (max 50000 chars).'),{code:'BIG'});
  const slug=noteSlug(name),path=notePath(slug),st=await NF('stat',{path});
  const old=st.exists?(await loadNotes(true)).find(x=>x.slug===slug):null;
  if(st.exists&&!o.overwrite)return{exists:true,slug,name:old?old.name:name};
  const rec={slug,name:old&&!o.rename?old.name:name,tags:o.tags!=null?noteTags(o.tags):(old?old.tags:[]),src:o.src==='ai'?'ai':'user',created:old?old.created:'',body};
  const r=await NF('write',{path,content:noteSer(rec)});
  NOTE_C.t=0;
  return{ok:true,rec,created:!st.exists,backed:!!r.backed};
}
function noteCardText(r,head){
  return(head?head+'\n':'')+'**'+r.name+'**'+((r.tags&&r.tags.length)?'  ('+r.tags.join(', ')+')':'')+(r.src==='ai'?'  - AI ne likha, tumhara text nahi':'')+'\n```\n'+noFence(r.body)+'\n```';
}
// Card in the chat. tool=true when it comes from an AI tool (then the AI gets a short note in the history, never the text).
function noteShow(r,head,tool){
  H.push(tool?{role:'assistant',by:'Notes',local:1,content:noteCardText(r,head),aiNote:'Note card dikhaya: '+r.name+' (text tumhe nahi diya)'}:{role:'assistant',by:'Notes',info:1,content:noteCardText(r,head)});
  liveRender();
}
function noteChoices(list,head,tool){
  NOTE_LAST=list.map(x=>x.slug);
  const c=list.slice(0,40).map((x,i)=>({slug:x.slug,label:(i+1)+'. '+x.name}));
  H.push(tool?{role:'assistant',by:'Notes',local:1,content:head,choices:c,aiNote:'Notes ki list dikhayi: '+list.map(x=>x.name).join(', ')}:{role:'assistant',by:'Notes',info:1,content:head,choices:c});
  liveRender();
}
function noteH(m,hi){
  if(!m.choices||!m.choices.length)return'';
  return'<div class="nch">'+m.choices.map(c=>'<button type="button" class="nchoice" data-s="'+esc(c.slug)+'">'+esc(c.label)+'</button>').join('')+'</div>';
}
$('#chat').addEventListener('click',async e=>{
  const b=e.target.closest('.nchoice');if(!b)return;
  try{
    const r=(await loadNotes()).find(x=>x.slug===b.dataset.s);
    if(!r)H.push({role:'assistant',by:'Notes',info:1,content:'Ye note ab nahi mila (hat gaya ya naam badla).'});
    else H.push({role:'assistant',by:'Notes',info:1,content:noteCardText(r)});
    persist();render();
  }catch(er){}
});
const noteFail=e=>{
  const c=e&&e.code;
  if(c==='NO_ACCESS'){NF('requestAccess').catch(()=>{});return'Chaman ko All files access nahi hai (Settings khul gayi hai, allow karke dobara try karo).'}
  return errMsg(e);
};
// ---- AI tools ----
function noteSource(){
  const u=H.filter(m=>m.role==='user').slice(-4);
  return u.map(m=>String(m.content||'')+(m.files||[]).map(a=>'\n'+String(a.body||'')).join('')).join('\n\n').replace(/\r\n/g,'\n');
}
function noteVerbatim(t){
  const src=noteSource();t=String(t).replace(/\r\n/g,'\n').trim();
  if(src.indexOf(t)>=0)return true;
  const m=t.match(/^```[\w+-]*\n([\s\S]*?)\n?```$/)||t.match(/^`([^`\n]+)`$/);
  return!!(m&&src.indexOf(m[1].trim())>=0);
}
async function noteTool(name,a,note,fl){
  const bad=s=>{fl.bad=true;return note(s)};
  try{
    if(name==='note_save'){
      let text=String(a.text==null?'':a.text);
      const fence=text.trim().match(/^```[\w+-]*\n([\s\S]*?)\n?```$/)||text.trim().match(/^`([^`\n]+)`$/);
      if(fence)text=fence[1];
      if(!noteName(a.name))return bad('Note ka naam do.');
      if(!text.trim())return bad('Note ka text khaali hai.');
      if(!a.from_ai&&!noteVerbatim(text))return bad('Ye text Najeef ke message me exactly nahi mila, isliye save nahi kiya.')+' Uska apna text hubahu copy karke do (badlo mat, chhota mat karo). Agar text tumne khud likha hai to from_ai=true do.';
      const r=await noteSave({name:a.name,text,tags:a.tags,src:a.from_ai?'ai':'user',overwrite:!!a.overwrite});
      if(r.exists)return bad('"'+r.name+'" naam ka note pehle se hai, kuch badla nahi.')+' Alag naam do, ya Najeef bole to overwrite=true.';
      noteShow(r.rec,(r.created?'Note save hua:':'Note badla (purani copy backup/ me):'),true);
      return note('Note save: '+r.rec.name)+'\nOK. Najeef ko card dikha diya. Text dobara likhne ki zaroorat nahi. Wo ise /note '+r.rec.name+' se dekh sakta hai.';
    }
    if(name==='note_get'){
      const f=await noteFind(a.query);
      if(f.kind==='one'){noteShow(f.rec,'',true);return note('Note dikhaya: '+f.rec.name)+'\nNote ka card Najeef ko dikha diya. Text tumhe nahi diya aur tum use khud likhna mat. Bas ek chhoti line bolo.'}
      if(f.kind==='many'){
        if(!String(a.query||'').trim()){noteChoices(f.list,'Saare notes ('+f.list.length+'):',true);return note('Notes ki list dikhayi ('+f.list.length+')')+'\nList Najeef ko dikha di: '+f.list.map(x=>x.name).join(', ')}
        noteChoices(f.list,'Kai notes mile, chuno:',true);return note('Kai notes mile ('+f.list.length+')')+'\nList Najeef ko dikha di, wo tap karke chunega: '+f.list.map(x=>x.name).join(', ')+'. Khud koi text mat banao.';
      }
      return note('Note nahi mila: '+cut(String(a.query||''),40))+'\nKoi match nahi. Maujooda notes ke naam: '+(f.list&&f.list.length?f.list.map(x=>x.name).join(', '):'(koi note nahi)')+'. Najeef ko saaf bolo ki nahi mila, kuch banake mat do.';
    }
    return bad('Unknown tool: '+name);
  }catch(e){return bad('Note fail: '+noteFail(e))}
}
// ---- /note command (runs in the app, no AI) ----
function noteSplit(rest){
  const c=rest.indexOf(':'),nl=rest.indexOf('\n');
  if(c>0&&(nl<0||c<nl)&&c<=60)return{name:rest.slice(0,c),text:rest.slice(c+1).replace(/^[ \t]*\n?/,'')};
  if(nl>0&&nl<=60)return{name:rest.slice(0,nl),text:rest.slice(nl+1)};
  return null;
}
const NOTE_HELP='Note commands:\n- /note: saari notes\n- /note update command: ye note dhundh ke dikhata hai\n- /note #3: list ka teesra note\n- /note save naam: text\n- /note edit naam: naya text\n- /note tag naam: tag1, tag2\n- /note del naam';
async function noteCmd(arg){
  const say=(c,x)=>H.push(Object.assign({role:'assistant',by:'Notes',info:1,content:c},x||{}));
  arg=String(arg||'').replace(/^\s+/,'').replace(/\s+$/,'');
  try{
    const sub=arg.match(/^(save|add|edit|tag|del|rm|delete|help)\b[ \t]*([\s\S]*)$/i);
    if(sub){
      const k=sub[1].toLowerCase(),rest=sub[2];
      if(k==='help'){say(NOTE_HELP);return}
      if(k==='save'||k==='add'||k==='edit'){
        const p=noteSplit(rest);
        if(!p||!noteName(p.name)||!p.text.trim()){say('Aise likho: /note '+k+' naam: text');return}
        const exists=(await loadNotes(true)).some(x=>x.slug===noteSlug(noteName(p.name)));
        if(k==='edit'&&!exists){say('"'+noteName(p.name)+'" naam ka note nahi hai. Naya banane ke liye /note save '+noteName(p.name)+': text');return}
        if(k!=='edit'&&exists){say('"'+noteName(p.name)+'" naam ka note pehle se hai. Badalna hai to /note edit '+noteName(p.name)+': naya text');return}
        const r=await noteSave({name:p.name,text:p.text,src:'user',overwrite:k==='edit'});
        noteShow(r.rec,k==='edit'?'Note badla (purani copy backup/ me):':'Note save hua:',false);return;
      }
      if(k==='tag'){
        const p=noteSplit(rest);
        if(!p){say('Aise likho: /note tag naam: tag1, tag2');return}
        const f=await noteFind(p.name);
        if(f.kind!=='one'){say('Is naam ka ek note nahi mila: '+noteName(p.name));return}
        await noteSave({name:f.rec.name,text:f.rec.body,tags:p.text,src:f.rec.src,overwrite:true});
        say('Tags set: '+f.rec.name+' ('+(noteTags(p.text).join(', ')||'koi nahi')+')');return;
      }
      // del
      const f=await noteFind(rest);
      if(f.kind==='none'){say('Note nahi mila: '+rest);return}
      if(f.kind==='many'){noteChoices(f.list,'Kai notes mile. Pehle /note #N ya poora naam se ek chuno, phir /note del naam:',false);return}
      if(!(await tconfirm('Note hatana hai',f.rec.name+'\n\n'+cut(f.rec.body,200),['note .trash me jayega, erase nahi hota'],'Hatao'))){say('Cancel, note waise hi hai.');return}
      await NF('trash',{path:notePath(f.rec.slug)});NOTE_C.t=0;
      say('Hataya: '+f.rec.name+' (.trash me)');return;
    }
    const f=await noteFind(arg);
    if(f.kind==='one'){noteShow(f.rec,'',false);return}
    if(f.kind==='many'){
      if(!arg)noteChoices(f.list,'Saare notes ('+f.list.length+'). Tap karo ya /note naam likho:',false);
      else noteChoices(f.list,'Kai notes mile, chuno:',false);
      return;
    }
    say(arg?'"'+arg+'" naam ka note nahi mila.'+(f.list&&f.list.length?' Saari list ke liye /note.':'')+'\nNaya: /note save naam: text':'Abhi koi note nahi.\n'+NOTE_HELP);
  }catch(e){say('Note fail: '+noteFail(e))}
}
