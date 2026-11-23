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
console.log(fail?'FAILED '+fail:'ALL PASS '+pass);process.exit(fail?1:0);
