// Keyboard-safe layout (step19). The page itself never scrolls: body is pinned to the VISIBLE area (visualViewport),
// so the header stays on top and the input stays right above the keyboard, with or without window resize.
(function(){
  const vv=window.visualViewport,R=document.documentElement;
  function apply(){
    const h=vv?vv.height:window.innerHeight,t=vv?vv.offsetTop:0;
    R.style.setProperty('--app-h',Math.round(h)+'px');
    R.style.setProperty('--app-top',Math.round(t)+'px');
    if(window.scrollY||R.scrollTop||document.body.scrollTop){window.scrollTo(0,0);R.scrollTop=0;document.body.scrollTop=0}
  }
  apply();
  if(vv){vv.addEventListener('resize',apply);vv.addEventListener('scroll',apply)}
  window.addEventListener('resize',apply);
  window.addEventListener('scroll',apply,{passive:true});
  document.addEventListener('focusin',()=>{apply();setTimeout(apply,120);setTimeout(apply,350)});
  document.addEventListener('focusout',()=>setTimeout(apply,150));
  // keep the newest message in view when the visible height changes (keyboard open/close, input grows)
  const chat=document.getElementById('chat');
  if(chat&&window.ResizeObserver){
    let near=true;
    chat.addEventListener('scroll',()=>{near=chat.scrollHeight-chat.scrollTop-chat.clientHeight<80},{passive:true});
    new ResizeObserver(()=>{if(near)chat.scrollTop=chat.scrollHeight}).observe(chat);
  }
})();
