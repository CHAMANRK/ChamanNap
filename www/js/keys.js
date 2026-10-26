const PROV=['groq','cerebras','openrouter','nvidia','mistral'];
let kiMode='first';
function kind(label){
  const l=(label||'').toLowerCase();
  if(/url|space|host/.test(l))return'url';
  if(/(^|[^a-z])hf([^a-z]|$)|hugging/.test(l))return'hf';
  if(l.includes('chaman'))return'chkey';
  if(l.includes('nvapi'))return'nvidia';
  for(const p of PROV)if(l.includes(p))return p;
  return'';
}
function vkind(v){
  if(/^https?:\/\//i.test(v))return'url';
  if(/^gsk_/.test(v))return'groq';
  if(/^csk-/.test(v))return'cerebras';
  if(/^sk-or-/.test(v))return'openrouter';
  if(/^nvapi-/.test(v))return'nvidia';
  if(/^hf_/.test(v))return'hf';
  return'';
}
function addKV(o,k,v){
  v=String(v).trim().replace(/^["']+|["',;]+$/g,'');
  if(!v)return;
  if(k==='url'){o.ch.url=v;return}
  if(k==='hf'){o.ch.hf=v;return}
  if(k==='chkey'){o.ch.key=v;return}
  if(PROV.includes(k)&&v.length>=8){(o.keys[k]=o.keys[k]||[]).push(v);return}
  o.skip++;
}
function feed(o,label,val){
  const lk=kind(label);
  const parts=String(val).split(/[\s,;]+/).map(x=>x.replace(/^["']+|["']+$/g,'')).filter(Boolean);
  if(lk==='url'||lk==='hf'||lk==='chkey'){addKV(o,lk,parts[0]||'');return}
  parts.forEach(p=>addKV(o,lk||vkind(p),p));
}
function walk(o,n,label){
  if(typeof n==='string'){feed(o,label,n);return}
  if(Array.isArray(n)){n.forEach(x=>walk(o,x,label));return}
  if(n&&typeof n==='object')Object.keys(n).forEach(k=>walk(o,n[k],(label?label+'_':'')+k));
}
function parseKeys(text){
  const o={keys:{},ch:{},skip:0};
  const t=String(text).replace(/^\uFEFF/,'').trim();
  try{walk(o,JSON.parse(t),'');return o}catch(e){}
  o.keys={};o.ch={};o.skip=0;
  t.split(/\r?\n/).forEach(line=>{
    line=line.trim();
    if(!line||/^(#|\/\/)/.test(line))return;
    if(/^https?:\/\//i.test(line)){feed(o,'url',line);return}
    const m=line.match(/^["']?([A-Za-z0-9_. -]+?)["']?\s*[=:]\s*(.+)$/);
    if(m)feed(o,m[1],m[2]);else feed(o,'',line);
  });
  return o;
}
function sumr(o){
  const a=[];
  PROV.forEach(id=>{const n=(o.keys[id]||[]).length;if(n)a.push(P.find(p=>p.id===id).name.replace(' (optional)','')+': '+n+(n>1?' keys':' key'))});
  if(o.ch.key)a.push('Chaman key');if(o.ch.hf)a.push('HF token');if(o.ch.url)a.push('Space URL');
  return a;
}
const mergeKeys=(old,add)=>{const set=[];(String(old||'').split(/[\s,]+/).filter(Boolean).concat(add)).forEach(k=>{if(set.indexOf(k)<0)set.push(k)});return set.join(', ')};
function applyKeys(o){
  PROV.forEach(id=>{if(o.keys[id])S.keys[id]=mergeKeys(S.keys[id],o.keys[id])});
  Object.assign(S.ch,o.ch);S.ptr={};sv('nap_s',S);
}
function modal(state,list){
  const m=$('#modal'),c=$('#mcard');m.classList.add('open');
  const up='<svg viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5M5 20h14"/></svg>';
  if(state==='done'){
    c.innerHTML='<h2>Keys set ho gayi</h2><ul>'+list.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul><button class="btn" id="mdone">Done</button>';
    $('#mdone').onclick=()=>{sv('nap_first',1);m.classList.remove('open')};
    return;
  }
  c.innerHTML='<h2>Keys import karo</h2><p>'+(state==='none'?'Is file me koi key nahi mili. Dusri file chuno ya baad me Settings se daalo.':'Apni keys ki .json ya .txt file chuno. File phone se bahar nahi jaati. Ye option Settings me bhi milega.')+'</p><button class="btn" id="mpick">'+up+'File chuno</button><button class="btn ghost" id="mskip">Skip</button>';
  $('#mpick').onclick=()=>{kiMode='first';$('#ki').click()};
  $('#mskip').onclick=()=>{sv('nap_first',1);m.classList.remove('open')};
}
$('#ki').onchange=async e=>{
  const f=e.target.files[0];e.target.value='';if(!f)return;
  let txt='';try{txt=await f.text()}catch(err){}
  const o=parseKeys(txt),a=sumr(o);
  if(kiMode==='sheet'){
    const msg=$('#imsg');if(!msg)return;
    if(!a.length){msg.textContent='Is file me koi key nahi mili.';return}
    PROV.forEach(id=>{const ta=$('#k_'+id);if(ta&&o.keys[id])ta.value=mergeKeys(ta.value,o.keys[id])});
    if(o.ch.url)$('#c_url').value=o.ch.url;
    if(o.ch.key)$('#c_key').value=o.ch.key;
    if(o.ch.hf)$('#c_hf').value=o.ch.hf;
    msg.textContent='Mila: '+a.join(', ')+(o.skip?' ('+o.skip+' entry samajh nahi aayi)':'')+'. Ab Save dabao.';
    return;
  }
  if(!a.length){modal('none');return}
  applyKeys(o);modal('done',a.concat(o.skip?[o.skip+' entry samajh nahi aayi']:[]));
};
const hasKeys=Object.keys(S.keys).some(k=>(S.keys[k]||'').trim())||(S.ch&&S.ch.key);
if(!hasKeys&&!ld('nap_first',0))modal('ask');

