function syncProv(){
  const s=$('#prov');
  if(!s.options.length)s.innerHTML=['auto'].concat(P.map(p=>p.id)).map(id=>'<option value="'+id+'">'+provName(id)+'</option>').join('');
  s.value=S.prov||'auto';
}
$('#prov').onchange=e=>{S.prov=e.target.value;sv('nap_s',S)};
syncProv();
render();
