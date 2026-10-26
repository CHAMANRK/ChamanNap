function rendP(){const d=$('#pend');d.innerHTML=PEND.map((a,i)=>'<span class="chip">'+esc(a.name)+' - '+kb(a.size)+'<button type="button" data-i="'+i+'" aria-label="Remove"><svg viewBox="0 0 24 24" width="14" height="14"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg></button></span>').join('');d.style.display=PEND.length?'flex':'none'}
function shrink(f){return new Promise((res,rej)=>{const u=URL.createObjectURL(f),im=new Image();im.onload=()=>{const M=896,k=Math.min(1,M/Math.max(im.width,im.height)),c=document.createElement('canvas');c.width=Math.round(im.width*k);c.height=Math.round(im.height*k);c.getContext('2d').drawImage(im,0,0,c.width,c.height);URL.revokeObjectURL(u);res(c.toDataURL('image/jpeg',.7))};im.onerror=()=>{URL.revokeObjectURL(u);rej(new Error('img'))};im.src=u})}
async function readAtt(f){
  const o={name:f.name,size:f.size};
  if(f.type.startsWith('image/')&&f.type!=='image/svg+xml'){try{o.img=await shrink(f);o.kind='img';return o}catch(e){}}
  if(f.size<=2097152){
    const u=new Uint8Array(await f.arrayBuffer());let bin=false;
    for(let i=0;i<Math.min(u.length,8000);i++){if(u[i]===0){bin=true;break}}
    if(!bin){const t=new TextDecoder('utf-8').decode(u);if((t.match(/\uFFFD/g)||[]).length<=t.length*.01+2){o.kind='text';o.cut=t.length>60000;o.body=o.cut?t.slice(0,60000):t;return o}}
  }
  o.kind='bin';return o;
}
$('#att').onclick=()=>$('#fi').click();
$('#fi').onchange=async e=>{const fs=Array.from(e.target.files);e.target.value='';for(const f of fs){if(PEND.length>=6)break;try{PEND.push(await readAtt(f))}catch(err){PEND.push({name:f.name,size:f.size,kind:'bin'})}}rendP()};
$('#pend').onclick=e=>{const b=e.target.closest('button');if(b){PEND.splice(+b.dataset.i,1);rendP()}};

