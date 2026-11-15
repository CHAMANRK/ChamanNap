// 1.36001.0: tables (and any wide block in .tw) scroll sideways, words never break. Run: cd www && node ../tests/sim-table.js
const fs=require('fs');
let pass=0,fail=0;const ok=(c,m)=>{if(c){pass++;console.log('PASS',m)}else{fail++;console.log('FAIL',m)}};
const css=fs.readFileSync('css/style.css','utf8'),core=fs.readFileSync('js/core.js','utf8');
const rule=sel=>{const m=css.match(new RegExp('(?:^|\\n)'+sel.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\{([^}]*)\\}'));return m?m[1]:''};
const tw=rule('.tw'),cell=rule('th,td'),msg=rule('.msg');
ok(/overflow-x:auto/.test(tw),'.tw scrolls sideways');
ok(/overflow-wrap:normal/.test(tw)&&/word-break:normal/.test(tw),'.tw: words never break (cancels .msg anywhere)');
ok(/overflow-wrap:normal/.test(cell)&&/word-break:normal/.test(cell),'cells: words never break');
ok(/min-width:\d+px/.test(cell),'cells have a minimum width, so a wide table grows past the screen and scrolls');
ok(/overflow-wrap:anywhere/.test(msg),'normal paragraphs unchanged (long links still wrap)');
ok(/class="tw"><table>/.test(core),'markdown tables are rendered inside .tw');
console.log(fail?'\nFAILED '+fail:'\nALL PASS '+pass);process.exit(fail?1:0);
