function syncProv(){
  const s=$('#prov');
  if(s&&!s.options.length)s.innerHTML=['auto'].concat(P.map(p=>p.id)).map(id=>'<option value="'+id+'">'+provName(id)+'</option>').join('');
  if(s)s.value=S.prov||'auto';
  const t=$('#provt');if(t)t.textContent=provName(S.prov||'auto').split(' (')[0];
}
// U1 (1.42000.0): provider is no longer in a header. Quick switch = chip in the composer (list opens above it); full row is in Settings > AI.
function provPop(open){
  const pp=$('#provpop'),b=$('#provb');if(!pp||!b)return;
  if(open){
    const cur=S.prov||'auto';
    pp.innerHTML=['auto'].concat(P.map(p=>p.id)).map(id=>'<button type="button" role="option" class="pit'+(cur===id?' on':'')+'" aria-selected="'+(cur===id)+'" data-id="'+id+'">'+esc(provName(id))+'</button>').join('');
    pp.hidden=false;b.setAttribute('aria-expanded','true');
  }else{pp.hidden=true;b.setAttribute('aria-expanded','false')}
}
if($('#provb')){
  $('#provb').onclick=e=>{e.stopPropagation();provPop($('#provpop').hidden)};
  $('#provpop').onclick=e=>{const x=e.target.closest('.pit');if(!x)return;S.prov=x.dataset.id;sv('nap_s',S);syncProv();provPop(false)};
  if(typeof document.addEventListener==='function')document.addEventListener('click',e=>{const pp=$('#provpop');if(pp&&!pp.hidden&&!(e.target.closest&&e.target.closest('#provpop')))provPop(false)});
}
syncProv();
render();
