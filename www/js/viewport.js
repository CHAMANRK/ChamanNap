// free-scroll state (1.48000.0). Declared here because this file loads first and its observers fire at once; helpers are in core.js.
var chNear=true,chNew=false;
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
    // chNear / chNew live in core.js (free scroll, 1.48000.0)
    chat.addEventListener('scroll',()=>{if(typeof chAtBottom!=='function')return;chNear=chAtBottom(chat);if(chNear)chNew=false;chBtn()},{passive:true});
    const dn0=document.getElementById('chdn');
    new ResizeObserver(()=>{
      if(chNear)chat.scrollTop=chat.scrollHeight;
      if(dn0)dn0.style.bottom=Math.max(0,Math.round(document.body.clientHeight-chat.getBoundingClientRect().bottom+(vv?0:0)))+12+'px';
    }).observe(chat);
  }
  const dn=document.getElementById('chdn');
  if(dn)dn.addEventListener('click',()=>{if(typeof chJump==='function')chJump()});
})();
