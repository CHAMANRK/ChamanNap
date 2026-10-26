const STN={media:'Media',ring:'Ringtone',alarm:'Alarm'};
const fn=(name,description,properties,required)=>({type:'function',function:{name,description,parameters:{type:'object',properties,required:required||[]}}});
const TOOLS=[
  fn('torch','Turn the phone flashlight on or off, or toggle it.',{state:{type:'string',enum:['on','off','toggle']}},['state']),
  fn('set_volume','Set or change phone volume. Give level (0-100) to set it, or change up/down. level 0 = mute.',{stream:{type:'string',enum:['media','ring','alarm'],description:'default media'},level:{type:'integer',minimum:0,maximum:100},change:{type:'string',enum:['up','down']}}),
  fn('set_brightness','Set or change screen brightness. Give level (0-100), or change up/down, or auto=true for automatic brightness.',{level:{type:'integer',minimum:0,maximum:100},change:{type:'string',enum:['up','down']},auto:{type:'boolean'}}),
  fn('open_app','Open an installed app by its name, for example WhatsApp or Camera.',{name:{type:'string'}},['name']),
  fn('call','Start a phone call. Najeef must tap a confirm card first. contact is a saved contact name or a phone number.',{contact:{type:'string'}},['contact']),
  fn('send_sms','Send an SMS. Najeef must tap a confirm card first. contact is a saved contact name or a phone number.',{contact:{type:'string'},text:{type:'string'}},['contact','text']),
  fn('read_sms','Show recent SMS to Najeef on screen. You will NOT receive the message content. from is an optional contact name or sender.',{from:{type:'string'},count:{type:'integer',minimum:1,maximum:10}})
];
async function execTool(name,a,steps){
  a=a||{};
  const note=s=>{steps.push(s);return s};
  const say=(content,x)=>H.push(Object.assign({role:'assistant',content,by:'Phone',local:1},x||{}));
  try{
    if(name==='torch'){const r=await NP('torch',a.state==='on'?{on:true}:a.state==='off'?{on:false}:{});return note('Torch '+(r.on?'on':'off')+' hai.')}
    if(name==='set_volume'){
      const st=STN[a.stream]?a.stream:'media',o={stream:st};
      if(a.level!==undefined&&a.level!==null)o.level=Math.max(0,Math.min(100,Math.round(+a.level||0)));else if(a.change==='up')o.delta=1;else if(a.change==='down')o.delta=-1;
      const r=await NP('volume',o);return note(STN[st]+' volume '+r.level+'% hai.');
    }
    if(name==='set_brightness'){
      const o={};
      if(a.auto)o.auto=true;else if(a.level!==undefined&&a.level!==null)o.level=Math.max(0,Math.min(100,Math.round(+a.level||0)));else if(a.change==='up')o.delta=1;else if(a.change==='down')o.delta=-1;
      const r=await NP('brightness',o);return note(r.auto?'Brightness auto hai.':'Brightness '+r.level+'% hai.');
    }
    if(name==='open_app'){const r=await NP('openApp',{name:String(a.name||'')});return note(r.label+' khul gaya.')}
    if(name==='call'||name==='send_sms'){
      const who=String(a.contact||'').trim(),type=name==='call'?'call':'sms',text=String(a.text||'').trim();
      if(!who)return note('Contact nahi diya.');
      if(type==='sms'&&!text)return note('SMS ka text nahi diya.');
      const rs=await resolveWho(who);
      if(!rs.length)return note('"'+who+'" contact me nahi mila. Najeef se number poochho aur number ke saath dobara try karo.');
      askConfirm(type,text,rs);
      return note((type==='sms'?'SMS':'Call')+' ka confirm card dikha diya.')+' Abhi kuch bheja/lagaya nahi gaya, Najeef ke tap karne par hi hoga. Dobara tool mat chalao.';
    }
    if(name==='read_sms'){
      const r=await NP('readSms',{limit:Math.min(10,Math.max(1,+a.count||5)),query:String(a.from||'')});
      const L=r.messages||[];
      if(!L.length)return note('Koi SMS nahi mila.');
      say(L.map(x=>(x.name||x.address)+' ('+fmtDate(x.date)+')\n'+String(x.body||'').slice(0,300)).join('\n\n'),{aiNote:L.length+' SMS padhe aur Najeef ko dikhaye. Unka content tumhe nahi bheja gaya.'});
      return note(L.length+' SMS Najeef ko screen pe dikhaye.')+' Content tumhe nahi diya gaya.';
    }
    return 'Unknown tool: '+name;
  }catch(e){
    if(e&&e.code==='NEED_WRITE_SETTINGS')return note('Brightness ke liye "Modify system settings" permission chahiye. Settings khul gayi hai, Najeef allow karke dobara bole.');
    if(e&&e.code==='NOT_FOUND')return note('"'+(a.name||'')+'" naam ka app nahi mila.');
    return note('Fail: '+errMsg(e));
  }
}
