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
let S=Object.assign({theme:'auto',prov:'auto',system:DEF_SYS,keys:{},models:{},ptr:{},vision:{provider:'openrouter',model:'openrouter/free'},ch:{url:'https://chamanvip-chaman.hf.space',key:'',hf:''},ws:{auto:true},lg:{on:true},cc:'91'},ld('nap_s',{}));
if([OLD_SYS,PREV_SYS,PREV2_SYS,PREV3_SYS,PREV4_SYS,PREV5_SYS,PREV6_SYS,PREV7_SYS,PREV8_SYS,PREV9_SYS,PREV10_SYS,PREV11_SYS,PREV12_SYS,PREV13_SYS,PREV14_SYS,PREV15_SYS].includes(S.system)){S.system=DEF_SYS;sv('nap_s',S)}
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
// Markdown (safe subset): code blocks with language + copy, headings, bold, italic, strike, inline code, bullet/numbered lists, quotes, tables, hr, [text](url) as plain text.
function mdInl(s){
  s=esc(s);const c=[];
  s=s.replace(/`([^`\n]+)`/g,(_,x)=>{c.push(x);return '\u0000'+(c.length-1)+'\u0000'});
  s=s.replace(/\*\*([^*\n]+?)\*\*/g,'<b>$1</b>').replace(/__([^_\n]+?)__/g,'<b>$1</b>').replace(/~~([^~\n]+?)~~/g,'<del>$1</del>')
    .replace(/(^|[^*\w])\*([^*\s][^*\n]*?)\*(?!\*)/g,'$1<i>$2</i>').replace(/(^|[^_\w])_([^_\s][^_\n]*?)_(?![_\w])/g,'$1<i>$2</i>')
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g,'<span class="lnk">$1</span> ($2)');
  return s.replace(/\u0000(\d+)\u0000/g,(_,k)=>'<code>'+c[+k]+'</code>');
}
function mdBlocks(t){
  const L=t.replace(/\r/g,'').replace(/\t/g,'    ').split('\n'),o=[];let i=0;
  const HR=/^\s*([-*_])(\s*\1){2,}\s*$/,LI=/^(\s*)([-*\u2022]|\d+[.)])\s+(\S.*)$/,HD=/^(#{1,4})\s+(\S.*)$/,QT=/^>\s?/,SEP=/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;
  const cells=l=>l.trim().replace(/^\|/,'').replace(/\|$/,'').split('|').map(x=>x.trim());
  const start=l=>HD.test(l)||HR.test(l)||LI.test(l)||QT.test(l);
  while(i<L.length){
    const l=L[i];let m;
    if(!l.trim()){i++;continue}
    if((m=l.match(HD))){o.push('<div class="h h'+m[1].length+'">'+mdInl(m[2])+'</div>');i++;continue}
    if(HR.test(l)){o.push('<hr>');i++;continue}
    if(QT.test(l)){const q=[];while(i<L.length&&QT.test(L[i])){q.push(L[i].replace(QT,''));i++}o.push('<blockquote>'+mdInl(q.join('\n'))+'</blockquote>');continue}
    if(l.indexOf('|')>=0&&i+1<L.length&&L[i+1].indexOf('|')>=0&&SEP.test(L[i+1])){
      const hd=cells(l);i+=2;const rows=[];
      while(i<L.length&&L[i].trim()&&L[i].indexOf('|')>=0){rows.push(cells(L[i]));i++}
      o.push('<div class="tw"><table><thead><tr>'+hd.map(x=>'<th>'+mdInl(x)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+hd.map((_,k)=>'<td>'+mdInl(r[k]||'')+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>');continue;
    }
    if(LI.test(l)&&!HR.test(l)){
      const items=[];
      while(i<L.length){
        const x=L[i];m=x.match(LI);
        if(m&&!HR.test(x)){items.push({d:Math.min(3,Math.floor(m[1].length/2)),b:/\d/.test(m[2])?m[2]:'\u2022',t:m[3]});i++;continue}
        if(!x.trim()){let k=i;while(k<L.length&&!L[k].trim())k++;if(k<L.length&&LI.test(L[k])&&!HR.test(L[k])){i=k;continue}break}
        if(/^\s{2,}\S/.test(x)&&items.length&&!start(x)){items[items.length-1].t+='\n'+x.trim();i++;continue}
        break;
      }
      o.push(items.map(x=>'<div class="li" style="--d:'+x.d+'"><span class="bul">'+esc(x.b)+'</span><span class="lt">'+mdInl(x.t)+'</span></div>').join(''));continue;
    }
    const p=[l];i++;
    while(i<L.length&&L[i].trim()&&!start(L[i])&&!(L[i].indexOf('|')>=0&&i+1<L.length&&SEP.test(L[i+1]))){p.push(L[i]);i++}
    o.push('<div class="p">'+mdInl(p.join('\n'))+'</div>');
  }
  return o.join('');
}
function fmt(t){
  t=String(t==null?'':t);let o='',last=0,m;
  const re=/```([\w+#.-]*)[ \t]*\n?([\s\S]*?)(?:```|$)/g;
  while((m=re.exec(t))){
    o+=mdBlocks(t.slice(last,m.index));last=re.lastIndex;
    o+='<div class="code"><div class="cbar">'+(m[1]?'<span class="lang">'+esc(m[1])+'</span>':'')+'<button type="button" class="cp" aria-label="Copy code">'+ICO_COPY+'</button></div><pre><code>'+esc(m[2].replace(/\n$/,''))+'</code></pre></div>';
    if(last>=t.length)break;
  }
  return o+mdBlocks(t.slice(last));
}

const kb=n=>n<1024?n+' B':n<1048576?(n/1024).toFixed(1)+' KB':(n/1048576).toFixed(1)+' MB';
const att=m=>{let h='';const hi=m.imgs&&m.imgs.length;if(hi)h+='<div class="chips">'+m.imgs.map(u=>'<img src="'+u+'" alt="">').join('')+'</div>';const fs=(m.files||[]).filter(a=>!(a.kind==='img'&&hi));if(fs.length)h+='<div class="chips">'+fs.map(a=>'<span class="chip">'+esc(a.name)+' - '+kb(a.size)+'</span>').join('')+'</div>';return h};
const stepsH=m=>m.steps&&m.steps.length?'<div class="steps">'+m.steps.map(esc).join('<br>')+'</div>':'';
function render(){
  const c=$('#chat');
  if(!H.length){c.innerHTML='<div class="empty"><b>Chaman</b>Kuch bhi pucho. Pehle Settings me keys daal do.</div>';return}
  c.innerHTML=H.map((m,hi)=>m.role==='user'?'<div class="msg me">'+esc(m.content||'')+att(m)+'</div>':'<div class="msg ai'+(m.err?' err':'')+'">'+stepsH(m)+fmt(m.content)+acts(m,hi)+(typeof artH==='function'?artH(m,hi):'')+(typeof noteH==='function'?noteH(m,hi):'')+(m.by?'<span class="by">'+esc(m.by)+'</span>':'')+'</div>').join('');
  c.scrollTop=c.scrollHeight;
}
