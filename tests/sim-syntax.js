// U4 (1.45000.0): syntax.js (tokenizer) + dock.js (risk dock logic). Run from www/: node ../tests/sim-syntax.js
const fs=require('fs'),vm=require('vm');
const ctx={console,Date,Math,JSON,String,Object,Array,Number,RegExp,Set,Map,Promise};
ctx.window=ctx;ctx.$=()=>null;ctx.document={addEventListener(){},querySelectorAll(){return[]}};
ctx.esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
ctx.H=[];
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('js/syntax.js','utf8'),ctx);
vm.runInContext(fs.readFileSync('js/dock.js','utf8'),ctx);
const ev=c=>vm.runInContext(c,ctx);
let pass=0,fail=0;const ok=(c,m)=>{if(c){pass++;console.log('PASS '+m)}else{fail++;console.log('FAIL '+m)}};
const hl=(code,lang)=>{ctx.__c=code;ctx.__l=lang;return ev('hlCode(__c,__l)')};
const plain=h=>h.replace(/<\/?span[^>]*>/g,'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&amp;/g,'&');
const has=(h,k,t)=>h.indexOf('<span class="'+k+'">'+t+'</span>')>=0;

// ---- language detection, caps
ok(hl('x','')===''&&hl('x','txt')===''&&hl('x','md')===''&&hl('x',undefined)==='','unknown / empty lang -> "" (caller shows plain)');
ok(hl('a','JavaScript')!==''&&hl('a','language-py')!==''&&hl('a','TS')!==''&&hl('<a>','svg')!==''&&hl('ls','termux')!=='','aliases: JavaScript, language-py, TS, svg, termux');
ok(hl('x'.repeat(24001),'js')==='','code > 24000 chars -> plain');
ok(hl('a\n'.repeat(801),'js')==='','code > 800 lines -> plain');
ok(hl('a\n'.repeat(700),'js')!=='','700 lines still highlighted');

// ---- js
let h=hl("const a = 1.5e3; // note\nfunction foo(x){ return 'hi' + `t${x}` + /re[/]x/g.test(x) }\nlet y = a / 2 / b; foo(0x1F)",'js');
ok(has(h,'hk','const')&&has(h,'hk','function')&&has(h,'hk','return')&&has(h,'hk','let'),'js: keywords');
ok(has(h,'hn','1.5e3')&&has(h,'hn','0x1F')&&has(h,'hn','2'),'js: numbers (float, exp, hex)');
ok(has(h,'hc','// note')&&has(h,'hs','&#39;hi&#39;')===false&&h.indexOf('<span class="hs">\'hi\'</span>')>=0,'js: comment and string');
ok(has(h,'hf','foo')&&h.indexOf('<span class="hs">`t${x}`</span>')>=0,'js: function name (def and call), template string');
ok(h.indexOf('<span class="hs">/re[/]x/g</span>')>=0,'js: regex literal with / inside a class');
ok(!/<span class="hs">\/ 2 \//.test(h)&&has(h,'hn','2'),'js: division is not a regex');
h=hl("/* multi\nline */ var s = \"un\\\"closed\nnext = 1",'js');
ok(h.indexOf('<span class="hc">/* multi\nline */</span>')>=0&&has(h,'hn','1'),'js: block comment over lines, unterminated string stops at line end');
h=hl('x.size = "a<b>&c"; if (a<b && c>d) {}','js');
ok(h.indexOf('&lt;b&gt;&amp;c')>=0&&h.indexOf('<b>')<0&&h.indexOf('a&lt;b &amp;&amp; c&gt;d')>=0,'js: html chars escaped');

// ---- python
h=hl("import os\n@app.route('/x')\nclass A:\n    def run(self, n=3):\n        '''doc\n        more'''\n        s = rb'\\d' + f\"{n}\" # c\n        return None if n else True",'py');
ok(has(h,'hk','import')&&has(h,'hk','class')&&has(h,'hk','def')&&has(h,'hk','return')&&has(h,'hk','None')&&has(h,'hk','True'),'py: keywords');
ok(has(h,'hf','run')&&has(h,'hf','A')&&has(h,'hf','@app.route'),'py: def/class names and decorator');
ok(h.indexOf("<span class=\"hs\">'''doc\n        more'''</span>")>=0,'py: triple-quoted docstring over lines');
ok(h.indexOf('<span class="hs">rb&#39;')<0&&/<span class="hs">rb'\\d'<\/span>/.test(h)&&/<span class="hs">f&quot;\{n\}&quot;<\/span>/.test(h),'py: string prefixes rb/f');
ok(has(h,'hc','# c')&&has(h,'hn','3'),'py: comment, number');
h=hl("x = 'it''s' # don't break\ny = 2",'py');
ok(has(h,'hc',"# don't break")&&has(h,'hn','2'),'py: apostrophe inside a comment does not start a string');

// ---- shell
h=hl("$ pkg install -y git && cd ~/x; echo \"v=$HOME ${PATH}\" 'a b' 2>&1 # done\nfor f in *.js; do rm \"$f\"; done\nFOO=1 npm test | tee out.txt",'sh');
ok(has(h,'hf','pkg')&&has(h,'hf','cd')&&has(h,'hf','echo')&&has(h,'hf','rm')&&has(h,'hf','npm')&&has(h,'hf','tee'),'sh: command names (start, after && ; | do, after VAR=)');
ok(has(h,'hk','for')&&has(h,'hk','in')&&has(h,'hk','do')&&has(h,'hk','done'),'sh: keywords');
ok(h.indexOf('<span class="hs">&quot;v=$HOME ${PATH}&quot;</span>')>=0&&h.indexOf("<span class=\"hs\">'a b'</span>")>=0,'sh: quoted strings');
ok(has(h,'hc','# done')&&has(h,'hc','$'),'sh: comment and "$ " prompt');
ok(!has(h,'hf','1')&&!has(h,'hf','install')&&!has(h,'hf','git'),'sh: 2>&1 and arguments are not coloured as commands');
h=hl("echo $HOME ${USER} $1 $(date)",'sh');
ok(has(h,'hn','$HOME')&&has(h,'hn','${USER}')&&has(h,'hn','$1')&&has(h,'hf','date'),'sh: variables, command inside $( )');

// ---- json
h=hl('{"name":"Chaman","n":-12.5e2,"ok":true,"x":null,"a":[1,2],"k" : "v"}','json');
ok(has(h,'hf','&quot;name&quot;')&&has(h,'hs','&quot;Chaman&quot;')&&has(h,'hf','&quot;k&quot;'),'json: keys vs string values');
ok(has(h,'hn','-12.5e2')&&has(h,'hk','true')&&has(h,'hk','null')&&has(h,'hn','1'),'json: numbers, literals');

// ---- css
h=hl("@media (max-width:600px){ a:hover{color:#2F6B41 !important; margin:0 10px; background:url(x.png)} }\n.card #id{padding:4px; --gap:2rem; /* c */ font-family:\"X\"}",'css');
ok(has(h,'hk','@media')&&has(h,'hk','!important'),'css: at-rule, !important');
ok(has(h,'hf','color')&&has(h,'hf','margin')&&has(h,'hf','padding')&&has(h,'hf','--gap')&&has(h,'hf','font-family')&&has(h,'hf','background'),'css: property names');
ok(!has(h,'hf','a')&&!/<span class="hf">hover/.test(h),'css: a:hover selector is not mistaken for a property');
ok(has(h,'hn','#2F6B41')&&has(h,'hn','10px')&&has(h,'hn','4px')&&has(h,'hn','2rem')&&has(h,'hn','0'),'css: hex colour, numbers with units');
ok(has(h,'hf','.card')&&has(h,'hf','#id')&&has(h,'hc','/* c */')&&has(h,'hs','&quot;X&quot;')&&has(h,'hf','url'),'css: .class, #id, comment, string, url()');

// ---- html (+ script/style bodies)
h=hl('<!DOCTYPE html>\n<!-- c -->\n<div class="a" id=x data-k=\'v\' hidden>1 < 2 &amp;</div>\n<script>const a = 1; // t\n</script>\n<style>p{color:red}</style><img src="a.png"/>','html');
ok(has(h,'hc','&lt;!-- c --&gt;')&&/<span class="hk">&lt;!DOCTYPE html&gt;<\/span>/.test(h),'html: doctype, comment');
ok(has(h,'hk','&lt;div')&&has(h,'hk','&lt;/div')&&has(h,'hf','class')&&has(h,'hs','&quot;a&quot;')&&has(h,'hf','id')&&has(h,'hs','x')&&has(h,'hf','hidden'),'html: tag names, attributes (quoted, unquoted, boolean)');
ok(has(h,'hk','const')&&has(h,'hc','// t')&&has(h,'hf','color'),'html: <script> body highlighted as js, <style> body as css');
ok(h.indexOf('1 &lt; 2 &amp;amp;')>=0,'html: text with "<" and entities stays plain and escaped');

// ---- text is never changed: strip spans == source. Samples + fuzz, all languages.
const LANGS=['js','py','sh','json','css','html'];
const samples=["const a=`x${1}`;\nlet r=/a\\/b/;//c","def f(): pass\n'''x","echo 'a\n\"b\n$(c","{\"a\":[1,{\"b\":null}]","a{b:c;d{e:f}}@x","<a b=\"c\n<script>var x</scr","<![CDATA[x]]><?xml?>","\\","'","\"","`","/*","<","&&&&","$","@","#","","\n\n\n"];
let rt=true,thr=false,bad='';
for(const L of LANGS)for(const s of samples){let o;try{o=hl(s,L)}catch(e){thr=true;bad=L+':'+JSON.stringify(s);continue}if(o!==''&&plain(o)!==s){rt=false;bad=L+':'+JSON.stringify(s)}}
ok(rt&&!thr,'roundtrip + no throw on tricky samples (all langs) '+bad);
let seed=12345;const rnd=()=>(seed=(seed*1103515245+12345)&0x7fffffff)/0x7fffffff;
const AL=['"',"'",'`','\\','/','*','#','{','}','(',')','<','>','=','$','&','|',';',':','@','!','-','.','\n',' ','a','b','e','1','0','x','def ','if ','<div ','</','<!--','-->','/*','*/','//','\'\'\'','"""'];
let fz=true,fzbad='';const t0=Date.now();
for(let k=0;k<1500;k++){
  let s='';const len=1+Math.floor(rnd()*80);for(let q=0;q<len;q++)s+=AL[Math.floor(rnd()*AL.length)];
  for(const L of LANGS){let o;try{o=hl(s,L)}catch(e){fz=false;fzbad='throw '+L+JSON.stringify(s);break}if(o!==''&&plain(o)!==s){fz=false;fzbad='mismatch '+L+JSON.stringify(s);break}}
  if(!fz)break;
}
ok(fz,'fuzz 1500 x 6 langs: never throws, text unchanged '+fzbad);
ok(Date.now()-t0<8000,'fuzz finished in time (no runaway loop): '+(Date.now()-t0)+'ms');

// ---- output is html-safe: only spans, everything else escaped
h=hl('<img src=x onerror="alert(1)"><script>alert(1)</script>','html');
ok(!/<(?!\/?span\b)[^>]*>/.test(h),'html lang: no raw tag other than <span> in output');
h=hl('x = "<b>"; // <i>','js');
ok(!/<(?!\/?span\b)[^>]*>/.test(h),'js: no raw tag other than <span> in output');

// ---- speed at the cap (24KB each)
let slow=0;
for(const L of LANGS){const big=(L==='html'?'<div class="a">text</div>\n':L==='css'?'a.b{color:#fff;margin:0 4px}\n':L==='json'?'{"k":[1,2,"v"],"z":null}\n':L==='py'?'def f(x): return x+1  # c\n':L==='sh'?'echo "a $B" | grep -v x # c\n':'const a = f(1, "s"); // c\n');
  let s='';while(s.length<23000)s+=big;const t=Date.now();hl(s,L);const d=Date.now()-t;if(d>slow)slow=d}
ok(slow<400,'24KB of code highlights in <400ms per language (slowest '+slow+'ms)');
ok(ev("(hlCode('a;','js'),hlCode('a;','js'))")===hl('a;','js')&&ev('HLC.size')>0,'cache returns the same string');
ev("for(let q=0;q<200;q++)hlCode('x'+q,'js')");
ok(ev('HLC.size')<=80,'cache stays <= 80 entries');

// ---- gutter + hlOr
ok(ev("hlGutter('a\\nb\\nc')")==='1\n2\n3'&&ev("hlGutter('a\\nb\\n')")==='1\n2'&&ev("hlGutter('')")==='1','gutter: line count, trailing newline ignored');
ok(ev("hlOr('<b>','txt')")==='&lt;b&gt;'&&ev("hlOr('const a','js')").indexOf('hk')>0,'hlOr: plain escape for unknown lang, spans for known');

// ---- risk dock logic (dock.js)
ev("H.length=0;H.push({role:'assistant',confirm:{state:'done'}},{role:'assistant',local:1,content:'Termux command chalani hai:\\n```\\nrm -rf <b>x</b>\\n```\\nWajah: files delete, lamba timeout (300s)',confirm:{type:'termux',id:'t1',opts:[{name:''}],state:'pending',lab:''}})");
ok(ev('rdPending()')===1,'dock: newest pending confirm found');
let p=ev('rdParts(H[1])');
ok(p.title==='Termux command chalani hai'&&p.level==='hi'&&p.risk==='files delete, lamba timeout (300s)'&&p.body==='rm -rf <b>x</b>'&&p.btns.length===1&&p.btns[0].l==='Chalao','dock: termux -> title, risk from "Wajah:", body without fences, level hi, label Chalao');
let d=ev('rdBuild(1)');
ok(d.indexOf('<b>x</b>')<0&&d.indexOf('&lt;b&gt;x&lt;/b&gt;')>0&&/data-m="1" data-o="x">Cancel</.test(d)&&/data-o="0">Chalao</.test(d)&&/Risk:<\/b> files delete/.test(d),'dock html: escaped body, Cancel + Chalao buttons carry data-m/data-o of the chat card');
ev("H.length=0;H.push({role:'assistant',local:1,content:'Termux command chalani hai:\\n```\\nls -la\\n```\\nWajah: heavy kaam',confirm:{type:'termux',id:'t2',opts:[{name:''}],state:'pending'}})");
ok(ev('rdParts(H[0])').level==='mid','dock: heavy kaam = mid (amber), not red');
ev("H.length=0;H.push({role:'assistant',by:'Phone',local:1,content:'SMS bhejna hai - kisko?:\\nRahul (+9198)\\nRohan (+9197)\\n\\nkal milte hain',confirm:{type:'sms',text:'kal milte hain',opts:[{name:'Rahul',number:'+9198'},{name:'Rohan',number:'+9197'}],state:'pending'}})");
p=ev('rdParts(H[0])');
ok(p.title==='SMS bhejna hai - kisko?'&&/turant jayega/.test(p.risk)&&p.level==='mid'&&p.body.indexOf('kal milte hain')>=0&&p.btns.length===2&&p.btns[0].l==='Bhejo: Rahul'&&p.btns[1].o==='1','dock: sms -> risk line, full SMS text in body, one button per contact');
ok(ev('rdBuild(0)').indexOf('rdy w')>0,'dock: several contacts -> full-width buttons');
ev("H.length=0;H.push({role:'assistant',local:1,content:'Call karna hai:\\nAmmi (+91)',confirm:{type:'call',opts:[{name:'Ammi',number:'+91'}],state:'pending'}})");
p=ev('rdParts(H[0])');
ok(/Call turant/.test(p.risk)&&p.btns[0].l==='Call karo','dock: call');
ev("H[0].confirm.state='done'");
ok(ev('rdPending()')===-1,'dock: nothing pending -> no dock');
ev("H.length=0;H.push({role:'assistant',content:'x'.repeat(5000),local:1,confirm:{type:'termux',id:'t',opts:[{name:''}],state:'pending'}})");
ok(ev('rdParts(H[0]).body.length')<=1500&&ev('rdParts(H[0]).title.length')<=90,'dock: body capped at 1500 chars, title 90');
ev("H.length=0;H.push({role:'assistant',content:'',local:1,confirm:{type:'termux',id:'t',opts:[],state:'pending'}})");
ok(ev('rdParts(H[0]).title')==='Confirm chahiye'&&ev('rdBuild(0)').indexOf('data-o="x"')>0,'dock: empty content / no opts still gives Cancel');

console.log('\nSIM-SYNTAX: pass='+pass+' fail='+fail);
process.exit(fail?1:0);
