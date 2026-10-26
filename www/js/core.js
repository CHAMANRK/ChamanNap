const P=[
 {id:'chaman',name:'Chaman',g:1},
 {id:'groq',name:'Groq',url:'https://api.groq.com/openai/v1/chat/completions',model:'openai/gpt-oss-120b'},
 {id:'cerebras',name:'Cerebras',url:'https://api.cerebras.ai/v1/chat/completions',model:'gpt-oss-120b'},
 {id:'openrouter',name:'OpenRouter',url:'https://openrouter.ai/api/v1/chat/completions',model:'openrouter/free'},
 {id:'nvidia',name:'NVIDIA',url:'https://integrate.api.nvidia.com/v1/chat/completions',model:'openai/gpt-oss-120b'},
 {id:'mistral',name:'Mistral (optional)',url:'https://api.mistral.ai/v1/chat/completions',model:'mistral-small-latest'}];
const $=s=>document.querySelector(s);
const ld=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))||d}catch(e){return d}};
const sv=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}};
let S=Object.assign({theme:'auto',prov:'auto',system:DEF_SYS,keys:{},models:{},ptr:{},vision:{provider:'openrouter',model:'openrouter/free'},ch:{url:'https://chamanvip-chaman.hf.space',key:'',hf:''}},ld('nap_s',{}));
if([OLD_SYS,PREV_SYS,PREV2_SYS,PREV3_SYS,PREV4_SYS].includes(S.system)){S.system=DEF_SYS;sv('nap_s',S)}
const OLDM={groq:'llama-3.3-70b-versatile',cerebras:'llama-3.3-70b',openrouter:'meta-llama/llama-3.3-70b-instruct:free',nvidia:'meta/llama-3.3-70b-instruct'};
Object.keys(OLDM).forEach(k=>{if(S.models&&S.models[k]===OLDM[k]){delete S.models[k];sv('nap_s',S)}});
if(S.vision&&S.vision.provider==='nvidia'&&['nvidia/nemotron-3-ultra-550b-a55b','google/gemma-3-27b-it'].includes(S.vision.model)){S.vision={provider:'openrouter',model:'openrouter/free'};sv('nap_s',S)}
let H=ld('nap_h',[]);
H.forEach(m=>{if(m.confirm&&m.confirm.state==='pending')m.confirm.state='expired'});
const cool={};let busy=false;

function theme(){const d=S.theme==='dark'||(S.theme==='auto'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light'}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',theme);theme();

const ICO_COPY='<svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>',ICO_OK='<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const esc=t=>t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const fmt=t=>esc(t).replace(/```(?:\w+)?\n?([\s\S]*?)```/g,(_,c)=>'<div class="code"><div class="cbar"><button type="button" class="cp" aria-label="Copy code">'+ICO_COPY+'</button></div><pre><code>'+c+'</code></pre></div>').replace(/`([^`\n]+)`/g,'<code>$1</code>').replace(/\*\*([^*\n]+)\*\*/g,'<b>$1</b>');

const kb=n=>n<1024?n+' B':n<1048576?(n/1024).toFixed(1)+' KB':(n/1048576).toFixed(1)+' MB';
const att=m=>{let h='';const hi=m.imgs&&m.imgs.length;if(hi)h+='<div class="chips">'+m.imgs.map(u=>'<img src="'+u+'" alt="">').join('')+'</div>';const fs=(m.files||[]).filter(a=>!(a.kind==='img'&&hi));if(fs.length)h+='<div class="chips">'+fs.map(a=>'<span class="chip">'+esc(a.name)+' - '+kb(a.size)+'</span>').join('')+'</div>';return h};
const stepsH=m=>m.steps&&m.steps.length?'<div class="steps">'+m.steps.map(esc).join('<br>')+'</div>':'';
function render(){
  const c=$('#chat');
  if(!H.length){c.innerHTML='<div class="empty"><b>Chaman</b>Kuch bhi pucho. Pehle Settings me keys daal do.</div>';return}
  c.innerHTML=H.map((m,hi)=>m.role==='user'?'<div class="msg me">'+esc(m.content||'')+att(m)+'</div>':'<div class="msg ai'+(m.err?' err':'')+'">'+stepsH(m)+fmt(m.content)+acts(m,hi)+(m.by?'<span class="by">'+esc(m.by)+'</span>':'')+'</div>').join('');
  c.scrollTop=c.scrollHeight;
}
