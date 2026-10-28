// Log saving: queue -> one Termux append command; redaction; flush failure keeps the queue. Run: cd www && node ../tests/sim-log.js
const vm=require('vm'),fs=require('fs');
const mk=()=>({value:'',style:{},dataset:{},options:[],classList:{add(){},remove(){},toggle(){}},addEventListener(){},insertAdjacentHTML(){},querySelector(){return mk()},set onclick(f){},set onchange(f){},innerHTML:''});
const cmds=[];let fail=false;
const ctx={document:{querySelector:()=>mk(),documentElement:{dataset:{}}},localStorage:{getItem:()=>null,setItem(){}},matchMedia:()=>({matches:true,addEventListener(){}}),navigator:{},console,setTimeout,clearTimeout,URL,Image:function(){},fetch:async()=>({})};
ctx.window=ctx;
ctx.Capacitor={nativePromise:async(pl,m,o)=>{if(pl==='Termux'){if(fail)throw Object.assign(new Error('x'),{code:'PERMISSION'});cmds.push(o.command);return{stdout:'LOGGED\n',exitCode:0}}return{}}};
vm.createContext(ctx);
for(const f of ['prompts','core','providers','chat','settings','attach','keys','helpers','phone','tools','termux','workspace','files','notes','slash','fast','rules','log','main'])vm.runInContext(fs.readFileSync('js/'+f+'.js','utf8'),ctx);
const R=s=>vm.runInContext(s,ctx);
(async()=>{
 R("logAdd('you','pdf padho gsk_abcdefghijklmnopqrstuvwxyz123456 aur kuch');logAdd('tool',logTool('screen_type',{text:'secret123',submit:true}));logAdd('tool',logTool('send_sms',{contact:'Rahul',text:'private msg'}));logAdd('termux','$ ls -la (exit 0)','a\\nb ```fence``` it\\'s');");
 fail=true;await R("logFlush()");console.log('after failed flush, queue:',R('LOGQ.length'),'| err:',R('LOG_ERR'));
 fail=false;R('LOG_BACKOFF=0');await R("logFlush()");console.log('after ok flush, queue:',R('LOGQ.length'),'| cmds:',cmds.length);
 R("S.lg.on=false;logAdd('you','should not log')");console.log('off -> queue:',R('LOGQ.length'));
 fs.writeFileSync('/tmp/logcmd.sh',cmds[0]);
})();
