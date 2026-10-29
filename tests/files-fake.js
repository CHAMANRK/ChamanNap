// Shared in-memory fake of the native Files plugin for the sims. FS maps full paths to strings.
module.exports=function(FS,opt){
  opt=opt||{};const R='/sdcard/Chaman';
  const rej=(code,message)=>Promise.reject(Object.assign(new Error(message),{code,message}));
  const dirs=()=>{const d=new Set([R]);Object.keys(FS).forEach(k=>{let p=k;while(p.lastIndexOf('/')>R.length-1&&(p=p.slice(0,p.lastIndexOf('/')))&&p.length>=R.length)d.add(p)});return d};
  const fn=async(m,o)=>{
    o=o||{};const p=o.path;
    if(opt.log)opt.log.push(m+' '+(p||''));
    if(opt.noAccess)return rej('NO_ACCESS','Chaman ko All files access nahi mili.');
    if(m==='requestAccess')return{};
    if(m==='status')return{granted:true,exists:true,sdk:34};
    if(m==='init')return{ok:true};
    if(m==='stat'){const t=FS[p];const isDir=t==null&&(dirs().has(p));return{path:p,exists:t!=null||isDir,dir:isDir,size:t==null?0:t.length}}
    if(m==='write'){const ex=FS[p]!=null;FS[p]=o.content;return{path:p,created:!ex,backed:ex&&o.backup!==false,newBytes:o.content.length,lines:o.content.split('\n').length}}
    if(m==='append'){const ex=FS[p]!=null;FS[p]=(FS[p]||'')+o.content;return{path:p,created:!ex,size:FS[p].length}}
    if(m==='read'){const t=FS[p];if(t==null)return rej('NOT_FOUND','File nahi mili.');const L=t.split('\n');return{path:p,text:t,lines:L.length,bytes:t.length,from:1,to:L.length,truncated:false}}
    if(m==='list'){
      const pre=p+'/',names=new Map();
      Object.keys(FS).forEach(k=>{if(k.indexOf(pre)!==0)return;const rest=k.slice(pre.length),i=rest.indexOf('/');if(i<0)names.set(rest,{name:rest,dir:false,size:FS[k].length,mtime:0});else names.set(rest.slice(0,i),{name:rest.slice(0,i),dir:true,size:0,mtime:0})});
      if(!names.size&&!dirs().has(p))return rej('NOT_FOUND','Folder nahi mila.');
      const it=Array.from(names.values());return{path:p,total:it.length,items:it};
    }
    if(m==='search'){
      const q=o.ignoreCase!==false?String(o.query).toLowerCase():o.query,hits=[];let scanned=0;
      Object.keys(FS).filter(k=>k.indexOf(p+'/')===0||k===p).sort().forEach(k=>{scanned++;FS[k].split('\n').forEach((ln,i)=>{if((o.ignoreCase!==false?ln.toLowerCase():ln).includes(q)&&hits.length<40)hits.push({file:k,line:i+1,text:ln.trim()})})});
      return{hits,scanned,more:false};
    }
    if(m==='trash'){const t=FS[p];if(t==null)return rej('NOT_FOUND','x');delete FS[p];FS[R+'/.trash/x_'+p.split('/').pop()]=t;return{from:p,to:R+'/.trash/x_'+p.split('/').pop(),dir:false}}
    if(m==='move'){FS[o.to]=FS[o.from];delete FS[o.from];return{from:o.from,to:o.to}}
    if(m==='edit'){let t=FS[p];if(t==null)return rej('NOT_FOUND','x');const old=t.length;for(const e of o.edits){const c=t.split(e.old).length-1;if(!c)return rej('NO_MATCH','x');if(c>1&&!o.replaceAll)return rej('MULTI','x');t=o.replaceAll?t.split(e.old).join(e.new):t.replace(e.old,e.new)}FS[p]=t;return{path:p,changes:o.edits.length,lines:[1],backed:true,oldBytes:old,newBytes:t.length,totalLines:t.split('\n').length,snippet:'1| '+t.split('\n')[0]}}
    return{};
  };
  return fn;
};
