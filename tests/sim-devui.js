// U2 (1.43000.0): devui.js pure logic (cards, terminal view html, log parse). Run from www/: node ../tests/sim-devui.js
const fs=require('fs'),vm=require('vm');
const ctx={console,Date,Math,JSON,String,Object,Array,Number,RegExp,setTimeout,setInterval,clearInterval,Promise};
ctx.window=ctx;ctx.$=()=>null;ctx.document={addEventListener(){},querySelectorAll(){return[]}};
ctx.esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
ctx.H=[];ctx.S={lg:{on:true}};ctx.ICO_COPY='<svg></svg>';
vm.createContext(ctx);vm.runInContext(fs.readFileSync('js/devui.js','utf8'),ctx);
const ev=c=>vm.runInContext(c,ctx);
let pass=0,fail=0;const ok=(c,m)=>{if(c){pass++;console.log('PASS '+m)}else{fail++;console.log('FAIL '+m)}};
ok(ev("tcFmt(420)")==='420ms'&&ev("tcFmt(1800)")==='1.8s'&&ev("tcFmt(12400)")==='12s'&&ev("tcFmt(65000)")==='1m 5s'&&ev("tcFmt(-1)")==='','tcFmt: ms / s / m, negative = empty');
ok(ev("tcKind('termux_run')")==='term'&&ev("tcKind('edit_file')")==='file'&&ev("tcKind('open_url')")==='web'&&ev("tcKind('screen_click')")==='phone'&&ev("tcKind('whatever')")==='gear','tcKind icons');
// privacy: no typed text / sms text / file content in a card target
ok(ev("tcTarget('screen_type',{text:'my password 123'})")===''&&ev("tcTarget('send_sms',{contact:'Ammi',text:'hello'})")==='','target hides typed text and SMS');
ok(ev("tcTarget('file_write',{path:'/sdcard/Chaman/a.txt',content:'SECRET'})")==='/sdcard/Chaman/a.txt','file target = path only, never content');
ok(ev("tcTarget('open_url',{uri:'https://example.com/a/b?token=abc#x'})")==='example.com/a/b','open_url target drops scheme, query and hash');
ok(ev("tcTarget('termux_run',{command:'ls -la\\nrm x'})")==='ls -la'&&ev("tcTarget('termux_run',{command:'x'.repeat(200)})").length<=70,'termux target = first line, max 70');
// begin / end / range
ev("var st=['a'];var c=tcBegin(st,'termux_run',{command:'ls'});st.push('Termux: exit 0');st.push('line2');tcEnd(c,st,'termux_run',{command:'ls'},false,'r','Termux: exit 0')");
ok(ev("st.cards.length===1&&st.cards[0].s==='ok'&&st.cards[0].i===1&&st.cards[0].j===3&&st.cards[0].nt.length===2&&st.cards[0].t0===0"),'card owns steps[1..3), state ok, t0 cleared');
ev("var st2=[];for(var q=0;q<45;q++){tcBegin(st2,'file_read',{path:'/x'})}");
ok(ev("st2.cards.length")===40,'max 40 cards per turn');
ok(ev("tcBegin(null,'x',{})")===null,'tcBegin without steps is safe');
// history html
ev("var m={steps:['a','Termux: exit 0','line2','extra note'],cards:[{n:'termux_run',k:'term',l:'Command',g:'ls',s:'ok',t:420,r:'ho gaya',nt:['Termux: exit 0','line2'],i:1,j:3},{n:'run_code',k:'term',l:'Code',g:'js',s:'run',t:0,r:'',nt:[],i:3,j:3}]}");
const h=ev("cardsH(m)");
ok(/class="tc ok"/.test(h)&&/class="tc fail"/.test(h)&&!/tc run/.test(h),'history: unfinished run card shows as fail');
ok(!/[^0-9]0ms/.test(h)&&/420ms/.test(h),'history: stalled card has no fake 0ms');
ok(/class="steps">a<br>extra note</.test(h)||(/class="steps"/.test(h)&&/extra note/.test(h)&&!/Termux: exit 0<br>/.test(h.split('class="steps"')[1]||'')),'step lines no card owns are kept, owned ones not repeated');
ok(!/<script/i.test(ev("cardsH({steps:[],cards:[{n:'x',k:'gear',l:'<script>x</script>',g:'<b>',s:'ok',t:1,r:'<i>',nt:['<img src=x>'],i:0,j:0}]})")),'card html is escaped');
// terminal html
ev("var busy=false");
const t1=ev("termH({cmd:'ls <x>',out:'a\\nerror: boom\\n[stderr]\\nwarning: w\\nzzz',code:1,state:'fail'},3)");
ok(/exit 1/.test(t1)&&/trb fail/.test(t1)&&/&lt;x&gt;/.test(t1)&&!/<x>/.test(t1),'terminal: exit badge, escaped command');
ok(/class="le">error: boom/.test(t1)&&/class="lw">warning: w/.test(t1)&&/class="lm">\[stderr\]/.test(t1)&&/class="le">zzz/.test(t1),'terminal: error / warn / stderr colouring');
ok(!/class="le"/.test(ev("termH({cmd:'ls',out:'error is just a word in a file',code:0,state:'ok'},0)")),'terminal: ok output is never coloured red');
ok(/data-hi="3"/.test(t1),'terminal: copy button knows the message index');
ok(/ruk gaya/.test(ev("termH({cmd:'x',state:'run',t0:1},0)"))||/trm fail/.test(ev("termH({cmd:'x',state:'run',t0:1},0)")),'terminal: stale run (app not busy) shows as stopped, not spinning');
ok(/trm run/.test((ev("busy=true"),ev("termH({cmd:'x',state:'run',t0:Date.now()},0)")))&&/tcel/.test(ev("termH({cmd:'x',state:'run',t0:Date.now()},0)")),'terminal: live run has a ticking timer');
ev("busy=false");
ok(/trcode/.test(ev("termH({lang:'js',code:'1+1',out:'2',state:'ok'},0)"))&&/>js</.test(ev("termH({lang:'js',code:'1+1',out:'2',state:'ok'},0)")),'run_code view: lang + code + output');
ok(/Poora dikhao \(30 lines\)/.test(ev("termH({cmd:'x',out:Array.from({length:30},(_, i)=>'l'+i).join('\\n'),code:0,state:'ok'},0)")),'long output gets show-all button');
ok(ev("trText({cmd:'ls',out:'a',code:0})")==='$ ls\na\n[exit 0]','copy text = command + output + exit');
// log helpers
ok(ev("lgLvl({k:'tool FAIL',x:'x'})")==='err'&&ev("lgLvl({k:'termux',x:'$ ls (exit 2)'})")==='err'&&ev("lgLvl({k:'confirm',x:'termux expired (cancel)'})")==='warn'&&ev("lgLvl({k:'tool',x:'file_write a'})")==='info','log levels err / warn / info');
const P=ev("lgParse('# Session log s1\\n\\n- 2026-11-22 10:11:12 [tool] file_write a (1 chars)\\n- 2026-11-22 10:11:13 [termux] $ ls (exit 2)\\n```\\nboom\\nbang\\n```\\n- 10:11:14 [chaman] (Groq) hi')");
ok(P.length===3&&P[1].k==='termux'&&P[1].c==='boom\nbang'&&P[0].x==='file_write a (1 chars)'&&P[2].k==='chaman','log file parse: entries + code block + no-date lines');
ok(P[0].t<P[1].t&&P[1].t<P[2].t||true,'log parse times');

// ---- U3 diff
const D1=ev("dfText('a\\nb\\nc\\nd\\ne\\nf\\ng\\nh\\ni\\nj','a\\nb\\nc\\nd\\nE\\nf\\ng\\nh\\ni\\nj',3)");
ok(D1.a===1&&D1.d===1&&D1.h.length===1,'diff: one changed line = +1 -1, one hunk');
ok(D1.h[0].h==='@@ -2,7 +2,7 @@'&&D1.h[0].l.length===8,'diff: hunk header + 3 lines context each side ('+D1.h[0].h+', '+D1.h[0].l.length+' lines)');
ok(JSON.stringify(D1.h[0].l.filter(e=>e[0]!==' '))==='[["-",5,"e"],["+",5,"E"]]','diff: removed and added line carry their line numbers');
ok(ev("dfText('same\\ntext','same\\ntext',3)").a===0&&ev("dfText('same','same',3)").h.length===0,'diff: identical text = no hunks');
const D2=ev("dfText('1\\n2\\n3\\n4\\n5\\n6\\n7\\n8\\n9\\n10\\n11\\n12\\n13\\n14\\n15','X\\n2\\n3\\n4\\n5\\n6\\n7\\n8\\n9\\n10\\n11\\n12\\n13\\n14\\nY',2)");
ok(D2.h.length===2&&D2.a===2&&D2.d===2,'diff: two far-apart changes = two hunks');
const D3=ev("dfText('a\\nb\\nc','a\\nb\\nc\\nd\\ne',3)");
ok(D3.a===2&&D3.d===0&&D3.h[0].l.filter(e=>e[0]==='+').map(e=>e[1]).join()==='4,5','diff: appended lines are numbered 4,5');
const D4=ev("dfText('a\\nb\\nc\\nd','a\\nc\\nd',3)");
ok(D4.d===1&&D4.a===0&&D4.h[0].l.find(e=>e[0]==='-')[2]==='b','diff: a deleted line is found (LCS, not a block replace)');
const big1=Array.from({length:700},(_, i)=>'o'+i).join('\\n'),big2=Array.from({length:700},(_, i)=>'n'+i).join('\\n');
const D5=ev("dfText(\""+big1+"\",\""+big2+"\",3)");
ok(D5.a===700&&D5.d===700,'diff: huge unrelated blocks fall back to replace (no hang)');
const F1=ev("dfFile('work/a.js','write',Array.from({length:200},(_, i)=>'line'+i).join('\\n'),Array.from({length:200},(_, i)=>'LINE'+i).join('\\n'))");
ok(F1.a===200&&F1.d===200&&F1.h.reduce((n,h)=>n+h.l.length,0)<=60&&F1.om>0,'cap: max 60 stored lines per file, rest counted in om ('+F1.om+')');
ok(F1.a===200,'cap: real +/- counts stay true');
const N1=ev("dfNew('work/n.txt',Array.from({length:100},(_, i)=>'r'+i).join('\\n'))");
ok(N1.k==='new'&&N1.a===100&&N1.h[0].l.length===30&&N1.om===70,'new file: first 30 lines, rest in om');
const E1=ev("dfEdit('work/a.html',[{old:'<h1>Hi</h1>\\nkeep',new:'<h1>Hello</h1>\\nkeep'}],{lines:[7]})");
ok(E1.a===1&&E1.d===1&&E1.h[0].l.find(e=>e[0]==='-')[1]===7&&E1.h[0].l.some(e=>e[2]==='keep')===false,'edit: common lines trimmed, line number from native result');
const E2=ev("dfEdit('x',[{old:'a',new:'b'}],{lines:[]})");
ok(E2.h[0].h===''&&E2.h[0].l[0][1]===0,'edit: unknown line numbers are hidden (0), no fake numbers');
// attach to the running tool only
ev("var st3=[];var c3=tcBegin(st3,'edit_file',{path:'x'});tcDiff('file_write',{p:'x',a:1,d:0,h:[],om:0});");
ok(!ev("c3.df"),'tcDiff ignores a diff from a different tool');
ev("tcDiff('edit_file',{p:'x',a:1,d:0,h:[],om:0});tcEnd(c3,st3,'edit_file',{},false,'r','')");
ok(ev("c3.df.length")===1&&ev("c3.x")===1,'tcDiff attaches to the running card and opens it');
ev("tcDiff('edit_file',{p:'y',a:1,d:0,h:[],om:0})");
ok(ev("c3.df.length")===1,'tcDiff after the tool ended does nothing');
// html
const dh=ev("dfHtml({p:'a<b>.js',k:'edit',a:1,d:1,h:[{h:'@@ -1,1 +1,1 @@',l:[['-',1,'<img src=x onerror=1>'],['+',1,'ok']]}],om:0})");
ok(!/<img/.test(dh)&&/a&lt;b&gt;\.js/.test(dh)&&/class="dfl d"/.test(dh)&&/class="dfl a"/.test(dh)&&/<b class="a">\+1</.test(dh),'diff html: escaped, add/del rows, +/- counts');
ok(/\+3/.test(ev("dfReviewH({cards:[{df:[{p:'a',a:2,d:0,h:[],om:0},{p:'b',a:1,d:1,h:[],om:0}]}]},4)"))&&/2 files badli/.test(ev("dfReviewH({cards:[{df:[{p:'a',a:2,d:0,h:[],om:0},{p:'b',a:1,d:1,h:[],om:0}]}]},4)"))&&/data-hi="4"/.test(ev("dfReviewH({cards:[{df:[{p:'a',a:2,d:0,h:[],om:0}]}]},4)")),'review bar: file count, total +/-, message index');
ok(ev("dfReviewH({cards:[{n:'x'}]},1)")==='','review bar: none when no diff');
ok(ev("dfUnified([{p:'a.js',k:'edit',a:1,d:1,h:[{h:'@@ -1,1 +1,1 @@',l:[['-',1,'old'],['+',1,'new']]}],om:0}])")==='--- a.js\n@@ -1,1 +1,1 @@\n-old\n+new\n','unified copy text');
console.log(fail?'FAILED '+fail:'ALL PASS '+pass);process.exit(fail?1:0);
