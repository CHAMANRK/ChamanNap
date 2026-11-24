// 1.49000.3: worker.js fetch wrapper: abort (AbortController) + timeout. Run from www/: node ../tests/sim-fetch.js
const fs=require('fs'),vm=require('vm');
let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++};
const src=fs.readFileSync('runner/worker.js','utf8');
async function make(){
  const posts=[],timers=[];
  const self={postMessage:m=>posts.push(m)};
  const ctx=vm.createContext({self,console,DOMException,Response,AbortController,Promise,
    setTimeout:(f,ms)=>{const t={f,ms,off:false};timers.push(t);return t},clearTimeout:t=>{if(t)t.off=true}});
  vm.runInContext(src,ctx);
  await self.onmessage({data:{t:'init',lang:'js',files:{}}});
  return {self,posts,timers,fetch:(...a)=>vm.runInContext('self.fetch',ctx)(...a)};
}
(async()=>{
  let w=await make();
  let p=w.fetch('https://api.github.com/zen',{});
  let net=w.posts.filter(m=>m.t==='net')[0];
  ok(net&&net.url==='https://api.github.com/zen'&&net.method==='GET','fetch posts a net request');
  await w.self.onmessage({data:{t:'net-res',id:net.id,status:200,text:'hi'}});
  let r=await p;ok(r.status===200&&await r.text()==='hi','normal answer still works');
  ok(w.timers.every(t=>t.off),'timeout timer cleared after the answer');

  w=await make();const ac=new AbortController();
  p=w.fetch('https://x.y/',{signal:ac.signal});let e1=null;p.catch(e=>e1=e);
  ac.abort();await new Promise(r=>setImmediate(r));
  ok(e1&&e1.name==='AbortError','abort() rejects the fetch with AbortError');
  net=w.posts.filter(m=>m.t==='net')[0];
  await w.self.onmessage({data:{t:'net-res',id:net.id,status:200,text:'late'}});
  ok(true,'late answer after abort is ignored (no throw)');

  w=await make();const ac2=new AbortController();ac2.abort();let e2=null;
  await w.fetch('https://x.y/',{signal:ac2.signal}).catch(e=>e2=e);
  ok(e2&&e2.name==='AbortError'&&w.posts.filter(m=>m.t==='net').length===0,'already aborted signal: rejects, no request sent');

  w=await make();p=w.fetch('https://x.y/',{});let e3=null;p.catch(e=>e3=e);
  const tm=w.timers.find(t=>!t.off&&t.ms===22000);ok(!!tm,'22 s backstop timer is set');
  tm.f();await new Promise(r=>setImmediate(r));
  ok(e3&&/20 sec me jawab nahi aaya/.test(e3.message),'timeout rejects with the 20 sec message');
  net=w.posts.filter(m=>m.t==='net')[0];
  await w.self.onmessage({data:{t:'net-res',id:net.id,status:200,text:'late'}});
  ok(true,'answer after timeout is ignored');

  w=await make();p=w.fetch('https://x.y/',{});let e4=null;p.catch(e=>e4=e);
  net=w.posts.filter(m=>m.t==='net')[0];
  await w.self.onmessage({data:{t:'net-res',id:net.id,err:'Ye site allowed nahi hai: x.y'}});
  await new Promise(r=>setImmediate(r));
  ok(e4&&/allowed nahi/.test(e4.message),'app error is passed through as a rejection');
  console.log('FAILS: '+fails);process.exit(fails?1:0);
})();
