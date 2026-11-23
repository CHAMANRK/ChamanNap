// U4 (1.45000.0): chhota apna syntax highlighter (koi library nahi). Chat code blocks, Rich UI `code` widget aur in-app file viewer me use hota hai.
// hlCode(code,lang) -> html string (escaped, <span class="hk|hs|hf|hn|hc">), ya '' agar lang pata nahi / code bahut bada (caller plain esc() dikhaye).
// Rang: hk keyword, hs string, hf function/property/tag-attr, hn number/variable, hc comment (CSS vars --syk/--sys/--syf/--syn/--syc).
// Copy ke liye textContent hamesha asli code ke barabar rehta hai (sirf spans lagte hain, kuch badalta nahi).
const HL_MAXC=24000,HL_MAXL=800;
const HL_ALIAS={js:'js',javascript:'js',mjs:'js',cjs:'js',jsx:'js',ts:'js',tsx:'js',typescript:'js',java:'js',kt:'js',kotlin:'js',
  py:'py',python:'py',json:'json',jsonc:'json',html:'html',htm:'html',xml:'html',svg:'html',css:'css',scss:'css',
  sh:'sh',bash:'sh',shell:'sh',zsh:'sh',termux:'sh',console:'sh'};
const HL_KW={
  js:new Set('break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new of return static super switch this throw try typeof var void while with yield async await true false null undefined NaN interface enum implements public private protected readonly abstract override package fun val when'.split(' ')),
  py:new Set('and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield True False None self'.split(' ')),
  sh:new Set('if then else elif fi for while until do done case esac in function select return exit break continue local export readonly unset'.split(' '))
};
const HL_SHPRE=new Set('sudo time env nohup exec xargs command then do else elif if while until ! {'.split(' '));
const hlE=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
// output builder: p = plain text, t = coloured token, w = already-escaped html
function hlMk(c){
  const a=[];let ps=0,pos=0;
  return{
    // flush plain text up to index j, then colour c.slice(pos,end)
    tok(k,end){if(pos>ps)a.push(hlE(c.slice(ps,pos)));a.push('<span class="'+k+'">'+hlE(c.slice(pos,end))+'</span>');pos=end;ps=end},
    raw(html,end){if(pos>ps)a.push(hlE(c.slice(ps,pos)));a.push(html);pos=end;ps=end},
    at(){return pos},go(j){pos=j},
    done(){if(c.length>ps)a.push(hlE(c.slice(ps)));return a.join('')}
  };
}
// single-line string: ends at closing quote or at end of line; backslash escapes
function hlStrEnd(c,i,q,esc){
  const n=c.length;let j=i+1;
  while(j<n){const d=c[j];if(esc!==false&&d==='\\'){j+=2;continue}if(d===q)return Math.min(j+1,n);if(d==='\n')return j;j++}
  return n;
}
function hlRegexEnd(c,i){
  const n=c.length;let j=i+1,cls=false;
  if(c[j]==='/'||c[j]==='*')return 0;
  while(j<n){
    const d=c[j];
    if(d==='\n')return 0;
    if(d==='\\'){j+=2;continue}
    if(d==='[')cls=true;else if(d===']')cls=false;
    else if(d==='/'&&!cls){j++;while(j<n&&/[a-z]/i.test(c[j]))j++;return j}
    j++;
  }
  return 0;
}
const HL_NUM_JS=/0[xX][0-9a-fA-F_]+n?|0[bB][01_]+n?|\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?n?/y;
const HL_NUM_PY=/0[xXoObB][0-9a-fA-F_]+|\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?[jJ]?/y;
const HL_ID=/[A-Za-z_$][\w$]*/y;
function hlNext(c,j){const n=c.length;while(j<n&&(c[j]===' '||c[j]==='\t'))j++;return c[j]||''}

function hlJs(c){
  const e=hlMk(c),n=c.length,kw=HL_KW.js;let i=0,prev='',pw='';
  while(i<n){
    const ch=c[i],nx=c[i+1];
    if(ch==='/'&&nx==='/'){let j=c.indexOf('\n',i);if(j<0)j=n;e.go(i);e.tok('hc',j);i=j;continue}
    if(ch==='/'&&nx==='*'){let j=c.indexOf('*/',i+2);j=j<0?n:j+2;e.go(i);e.tok('hc',j);i=j;prev='';pw='';continue}
    if(ch==='"'||ch==="'"){const j=hlStrEnd(c,i,ch);e.go(i);e.tok('hs',j);i=j;prev='"';pw='';continue}
    if(ch==='`'){let j=i+1;while(j<n&&c[j]!=='`'){if(c[j]==='\\')j++;j++}j=Math.min(n,j+1);e.go(i);e.tok('hs',j);i=j;prev='"';pw='';continue}
    if(ch==='/'&&(prev===''||'(,=:[!&|?{};+-*%<>~^'.indexOf(prev)>=0||pw==='return'||pw==='typeof')){
      const j=hlRegexEnd(c,i);if(j>0){e.go(i);e.tok('hs',j);i=j;prev='"';pw='';continue}
    }
    if(ch>='0'&&ch<='9'&&!/[\w$]/.test(c[i-1]||'')){
      HL_NUM_JS.lastIndex=i;const m=HL_NUM_JS.exec(c);
      if(m){const j=i+m[0].length;e.go(i);e.tok('hn',j);i=j;prev='0';pw='';continue}
    }
    if(/[A-Za-z_$]/.test(ch)){
      HL_ID.lastIndex=i;const m=HL_ID.exec(c),w=m[0],j=i+w.length;
      let k=null;
      if(kw.has(w))k='hk';
      else if(pw==='function'||pw==='class'||pw==='fun'||pw==='interface'||pw==='enum'||hlNext(c,j)==='(')k='hf';
      if(k){e.go(i);e.tok(k,j)}
      i=j;prev=c[j-1];pw=w;continue;
    }
    if(ch!==' '&&ch!=='\t'&&ch!=='\n'&&ch!=='\r'){prev=ch;pw=''}
    i++;
  }
  return e.done();
}

function hlPy(c){
  const e=hlMk(c),n=c.length,kw=HL_KW.py;let i=0,pw='';
  while(i<n){
    const ch=c[i];
    if(ch==='#'){let j=c.indexOf('\n',i);if(j<0)j=n;e.go(i);e.tok('hc',j);i=j;continue}
    if(ch==='"'||ch==="'"){
      const q3=ch+ch+ch;let j;
      if(c.substr(i,3)===q3){j=c.indexOf(q3,i+3);j=j<0?n:j+3}else j=hlStrEnd(c,i,ch);
      e.go(i);e.tok('hs',j);i=j;pw='';continue;
    }
    if(ch>='0'&&ch<='9'&&!/[\w]/.test(c[i-1]||'')){
      HL_NUM_PY.lastIndex=i;const m=HL_NUM_PY.exec(c);
      if(m){const j=i+m[0].length;e.go(i);e.tok('hn',j);i=j;pw='';continue}
    }
    if(ch==='@'&&/[A-Za-z_]/.test(c[i+1]||'')&&(i===0||c[i-1]==='\n'||/^[ \t]*$/.test(c.slice(c.lastIndexOf('\n',i-1)+1,i)))){
      const m=/@[\w.]+/y;m.lastIndex=i;const r=m.exec(c);if(r){const j=i+r[0].length;e.go(i);e.tok('hf',j);i=j;pw='';continue}
    }
    if(/[A-Za-z_]/.test(ch)){
      HL_ID.lastIndex=i;const m=HL_ID.exec(c),w=m[0];let j=i+w.length;
      // string prefix: r"..", b'..', f"..", rb"..", ...
      if(w.length<=2&&/^(?:[rRbBuUfF]|[rR][bBfF]|[bBfF][rR])$/.test(w)&&(c[j]==='"'||c[j]==="'")){
        const q=c[j],q3=q+q+q;let k;
        if(c.substr(j,3)===q3){k=c.indexOf(q3,j+3);k=k<0?n:k+3}else k=hlStrEnd(c,j,q,/[rR]/.test(w)?false:true);
        e.go(i);e.tok('hs',k);i=k;pw='';continue;
      }
      let k=null;
      if(kw.has(w))k='hk';
      else if(pw==='def'||pw==='class'||hlNext(c,j)==='(')k='hf';
      if(k){e.go(i);e.tok(k,j)}
      i=j;pw=w;continue;
    }
    i++;
  }
  return e.done();
}

function hlSh(c){
  const e=hlMk(c),n=c.length,kw=HL_KW.sh;let i=0,cmd=true;
  const WORD=/[^\s|;&()<>'"`$#]+/y,VAR=/\$(?:\{[^}\n]*\}|[A-Za-z_]\w*|[0-9@#?*!$-])/y;
  while(i<n){
    const ch=c[i];
    if(ch==='&'&&(c[i-1]==='>'||c[i+1]==='>')){i++;continue}
    if(ch==='\n'||ch==='|'||ch===';'||ch==='&'||ch==='('){cmd=true;i++;continue}
    if(ch===' '||ch==='\t'||ch==='\r'||ch===')'||ch==='<'||ch==='>'||ch==='`'){i++;continue}
    if(ch==='#'&&(i===0||/\s/.test(c[i-1]))){let j=c.indexOf('\n',i);if(j<0)j=n;e.go(i);e.tok('hc',j);i=j;continue}
    if(ch==='$'&&(i===0||c[i-1]==='\n')&&c[i+1]===' '){e.go(i);e.tok('hc',i+1);i++;cmd=true;continue}
    if(ch==="'"){let j=i+1;while(j<n&&c[j]!=="'"&&c[j]!=='\n')j++;j=j<n&&c[j]==="'"?j+1:j;e.go(i);e.tok('hs',j);i=j;cmd=false;continue}
    if(ch==='"'){const j=hlStrEnd(c,i,'"');e.go(i);e.tok('hs',j);i=j;cmd=false;continue}
    if(ch==='$'){VAR.lastIndex=i;const m=VAR.exec(c);if(m){const j=i+m[0].length;e.go(i);e.tok('hn',j);i=j;cmd=false;continue}i++;continue}
    WORD.lastIndex=i;const m=WORD.exec(c);
    if(!m){i++;continue}
    const w=m[0],j=i+w.length;
    if(cmd){
      if(kw.has(w)){e.go(i);e.tok('hk',j);cmd=HL_SHPRE.has(w)||w==='do'||w==='then'||w==='else'}
      else if(/^[A-Za-z_]\w*=/.test(w)){/* VAR=value: command still to come */}
      else{e.go(i);e.tok('hf',j);cmd=HL_SHPRE.has(w)}
    }else if(kw.has(w)&&(w==='in'||w==='do'||w==='done'||w==='fi'||w==='then'||w==='esac')){e.go(i);e.tok('hk',j);cmd=(w==='do'||w==='then')}
    else if(/^-?\d+(\.\d+)?$/.test(w)){e.go(i);e.tok('hn',j)}
    i=j;
  }
  return e.done();
}

function hlJson(c){
  const e=hlMk(c),n=c.length;let i=0;
  const NUM=/-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y,WORD=/true|false|null/y;
  while(i<n){
    const ch=c[i];
    if(ch==='"'){const j=hlStrEnd(c,i,'"');e.go(i);e.tok(hlNext(c,j)===':'||/^\s*:/.test(c.slice(j,j+40))?'hf':'hs',j);i=j;continue}
    if(ch==='/'&&c[i+1]==='/'){let j=c.indexOf('\n',i);if(j<0)j=n;e.go(i);e.tok('hc',j);i=j;continue}
    if(ch==='/'&&c[i+1]==='*'){let j=c.indexOf('*/',i+2);j=j<0?n:j+2;e.go(i);e.tok('hc',j);i=j;continue}
    if(ch==='-'||(ch>='0'&&ch<='9')){NUM.lastIndex=i;const m=NUM.exec(c);if(m&&m[0]){const j=i+m[0].length;e.go(i);e.tok('hn',j);i=j;continue}}
    if(ch==='t'||ch==='f'||ch==='n'){WORD.lastIndex=i;const m=WORD.exec(c);if(m){const j=i+m[0].length;e.go(i);e.tok('hk',j);i=j;continue}}
    i++;
  }
  return e.done();
}

function hlCss(c){
  const e=hlMk(c),n=c.length;let i=0,depth=0,decl=false,afterColon=false,start=true;
  // statement start: inside a block, is this a declaration (ends with ; or }) or a nested selector (ends with {)?
  const calc=j=>{
    if(depth<=0)return false;
    while(j<n){const d=c[j];if(d==='{')return false;if(d===';'||d==='}')return true;if(d==='"'||d==="'"){j=hlStrEnd(c,j,d);continue}j++}
    return true;
  };
  while(i<n){
    if(start){decl=calc(i);afterColon=false;start=false}
    const ch=c[i];
    if(ch==='/'&&c[i+1]==='*'){let j=c.indexOf('*/',i+2);j=j<0?n:j+2;e.go(i);e.tok('hc',j);i=j;continue}
    if(ch==='"'||ch==="'"){const j=hlStrEnd(c,i,ch);e.go(i);e.tok('hs',j);i=j;continue}
    if(ch==='{'){depth++;start=true;i++;continue}
    if(ch==='}'){depth=Math.max(0,depth-1);start=true;i++;continue}
    if(ch===';'){start=true;i++;continue}
    if(ch===':'&&decl){afterColon=true;i++;continue}
    if(ch==='@'&&/[A-Za-z-]/.test(c[i+1]||'')){const m=/@[\w-]+/y;m.lastIndex=i;const r=m.exec(c);const j=i+r[0].length;e.go(i);e.tok('hk',j);i=j;continue}
    if(ch==='!'&&/^!\s*important/i.test(c.slice(i,i+14))){const m=/^!\s*important/i.exec(c.slice(i,i+14));e.go(i);e.tok('hk',i+m[0].length);i+=m[0].length;continue}
    if(ch==='#'){
      const m=/#[\w-]+/y;m.lastIndex=i;const r=m.exec(c);
      if(r){const j=i+r[0].length;if(decl&&afterColon&&/^#[0-9a-fA-F]{3,8}$/.test(r[0])){e.go(i);e.tok('hn',j)}else if(!decl){e.go(i);e.tok('hf',j)}i=j;continue}
    }
    if(ch==='.'&&!decl&&/[A-Za-z_-]/.test(c[i+1]||'')){const m=/\.[\w-]+/y;m.lastIndex=i;const r=m.exec(c);const j=i+r[0].length;e.go(i);e.tok('hf',j);i=j;continue}
    if(((ch>='0'&&ch<='9')||(ch==='.'&&/[0-9]/.test(c[i+1]||'')))&&decl&&!/[\w-]/.test(c[i-1]||'')){
      const m=/\d*\.?\d+(?:[eE][+-]?\d+)?[A-Za-z%]*/y;m.lastIndex=i;const r=m.exec(c);
      if(r){const j=i+r[0].length;e.go(i);e.tok('hn',j);i=j;continue}
    }
    if(/[A-Za-z_-]/.test(ch)){
      const m=/-{0,2}[A-Za-z_][\w-]*|-{1,2}(?=\s*[:)])/y;m.lastIndex=i;const r=m.exec(c);
      if(!r){i++;continue}
      const j=i+r[0].length;
      if(decl&&!afterColon&&hlNext(c,j)===':'){e.go(i);e.tok('hf',j)}
      else if(decl&&afterColon&&hlNext(c,j)==='('){e.go(i);e.tok('hf',j)}
      i=j;continue;
    }
    i++;
  }
  return e.done();
}

function hlHtml(c){
  const e=hlMk(c),n=c.length;let i=0;
  while(i<n){
    const lt=c.indexOf('<',i);
    if(lt<0)break;
    i=lt;
    if(c.startsWith('<!--',i)){let j=c.indexOf('-->',i+4);j=j<0?n:j+3;e.go(i);e.tok('hc',j);i=j;continue}
    if(c[i+1]==='!'||c[i+1]==='?'){let j=c.indexOf('>',i);j=j<0?n:j+1;e.go(i);e.tok('hk',j);i=j;continue}
    const m=/<\/?([A-Za-z][\w:-]*)/y;m.lastIndex=i;const r=m.exec(c);
    if(!r){i++;continue}
    const name=r[1].toLowerCase(),closing=r[0][1]==='/';
    e.go(i);e.tok('hk',i+r[0].length);i+=r[0].length;
    // attributes
    let selfClose=false;
    while(i<n&&c[i]!=='>'){
      const d=c[i];
      if(d==='"'||d==="'"){const j=hlStrEnd(c,i,d,false);e.go(i);e.tok('hs',j);i=j;continue}
      if(d==='/'&&c[i+1]==='>'){selfClose=true;i++;continue}
      if(/[^\s=\/<]/.test(d)){
        const am=/[^\s=\/>"'<]+/y;am.lastIndex=i;const ar=am.exec(c);
        if(ar){
          const j=i+ar[0].length;
          if(c[j]==='='||/^\s*=/.test(c.slice(j,j+8))){e.go(i);e.tok('hf',j);i=j;
            while(i<n&&(c[i]===' '||c[i]==='\t'||c[i]==='\n'||c[i]==='='))i++;
            if(i<n&&c[i]!=='"'&&c[i]!=="'"&&c[i]!=='>'){const um=/[^\s>]+/y;um.lastIndex=i;const ur=um.exec(c);if(ur){e.go(i);e.tok('hs',i+ur[0].length);i+=ur[0].length}}
          }else{e.go(i);e.tok('hf',j);i=j}
          continue;
        }
      }
      if(d==='<')break;
      i++;
    }
    if(i<n&&c[i]==='>')i++;
    // <script> / <style> body is highlighted as js / css
    if(!closing&&!selfClose&&(name==='script'||name==='style')){
      const re=new RegExp('</'+name+'\\b','i');const rest=c.slice(i),mm=re.exec(rest);
      const body=mm?rest.slice(0,mm.index):rest;
      if(body){
        let inner='';
        try{inner=name==='script'?hlJs(body):hlCss(body)}catch(x){inner=''}
        if(inner){e.go(i);e.raw(inner,i+body.length);i+=body.length}
      }
    }
  }
  return e.done();
}

const HL_FN={js:hlJs,py:hlPy,sh:hlSh,json:hlJson,css:hlCss,html:hlHtml};
const HLC=new Map();
// lang -> 'js'|'py'|... or '' (unknown)
const hlLang=l=>HL_ALIAS[String(l||'').toLowerCase().replace(/^language-/,'')]||'';
function hlCode(code,lang){
  const L=hlLang(lang);
  if(!L)return'';
  code=String(code==null?'':code);
  if(code.length>HL_MAXC||(code.match(/\n/g)||[]).length+1>HL_MAXL)return'';
  const key=L+'\u0001'+code,hit=HLC.get(key);
  if(hit!==undefined)return hit;
  let h='';
  try{h=HL_FN[L](code)}catch(err){h=''}
  if(HLC.size>=80)HLC.delete(HLC.keys().next().value);
  HLC.set(key,h);
  return h;
}
// html for a <code> body: highlighted if possible, else plain escaped
const hlOr=(code,lang)=>hlCode(code,lang)||hlE(String(code==null?'':code));
// line-number gutter text for a file viewer: "1\n2\n3" (a trailing newline does not add a line)
function hlGutter(text){
  const t=String(text==null?'':text).replace(/\n$/,''),n=(t.match(/\n/g)||[]).length+1;
  let s='';for(let k=1;k<=n;k++)s+=(k>1?'\n':'')+k;
  return s;
}
