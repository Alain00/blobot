import { spawn } from 'node:child_process';
import fs from 'node:fs';
const CWD=process.env.PROJ; const OUT=process.env.OUT;
const log=fs.createWriteStream(OUT,{flags:'a'});
function mk(){const c=spawn('/home/alain/.opencode/bin/opencode',['acp'],{cwd:CWD,stdio:['pipe','pipe','pipe'],env:{...process.env,NO_COLOR:'1'}});
 c.stderr.on('data',d=>log.write('STDERR '+d));
 let id=1,buf='';const pend=new Map();const updates=[];
 c.stdout.on('data',d=>{buf+=d;let i;while((i=buf.indexOf('\n'))>=0){const l=buf.slice(0,i);buf=buf.slice(i+1);if(!l.trim())continue;let m;try{m=JSON.parse(l)}catch{continue}
  if(m.id!==undefined&&!m.method){const p=pend.get(m.id);pend.delete(m.id);if(p)p(m.error?{__error:m.error}:{ok:m.result});}
  else if(m.method==='session/update'){updates.push(m.params.update);log.write('UPDATE '+JSON.stringify(m.params.update).slice(0,1500)+'\n');}
  else if(m.id!==undefined){c.stdin.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{outcome:{outcome:'selected',optionId:'once'}}})+'\n');}}});
 const call=(method,params)=>{const i=id++;c.stdin.write(JSON.stringify({jsonrpc:'2.0',id:i,method,params})+'\n');
  return new Promise(r=>{pend.set(i,r);setTimeout(()=>{if(pend.has(i)){pend.delete(i);r({__timeout:true})}},60000)});};
 return {c,call,updates};
}
const P=o=>(o===undefined?'undefined':JSON.stringify(o).slice(0,500));
(async()=>{
 // ---- process A
 let A=mk();
 await A.call('initialize',{protocolVersion:1,clientCapabilities:{fs:{readTextFile:true,writeTextFile:true},terminal:false}});
 const s=await A.call('session/new',{cwd:CWD,mcpServers:[]});
 const sid=s.ok.sessionId; console.log('A sid',sid);
 console.log('A prompt1:',P(await A.call('session/prompt',{sessionId:sid,prompt:[{type:'text',text:'Remember the codeword ZEBRA. Just reply OK. Do not use tools.'}]})));
 A.c.kill('SIGTERM'); await new Promise(r=>setTimeout(r,1500));
 // ---- process B: fresh process, load the session
 let B=mk();
 await B.call('initialize',{protocolVersion:1,clientCapabilities:{fs:{readTextFile:true,writeTextFile:true},terminal:false}});
 log.write('=== SESSION/LOAD ===\n');
 const before=B.updates.length;
 const ld=await B.call('session/load',{sessionId:sid,cwd:CWD,mcpServers:[]});
 console.log('B load ok, keys:',Object.keys(ld.ok||{}), 'error:', P(ld.__error));
 await new Promise(r=>setTimeout(r,1000));
 console.log('B replay updates after load:',B.updates.slice(before).map(u=>u.sessionUpdate).join(','));
 log.write('=== POST-LOAD PROMPT ===\n');
 console.log('B prompt2:',P(await B.call('session/prompt',{sessionId:sid,prompt:[{type:'text',text:'What codeword did I ask you to remember? Reply with just the word.'}]})));
 const said=B.updates.filter(u=>u.sessionUpdate==='agent_message_chunk').map(u=>u.content.text).join('');
 console.log('B said:',JSON.stringify(said));
 // config option
 console.log('set_config_option:',P(await B.call('session/set_config_option',{sessionId:sid,configId:'mode',value:'plan'})));
 console.log('set_mode:',P(await B.call('session/set_mode',{sessionId:sid,modeId:'plan'})));
 console.log('fork:',P(await B.call('session/fork',{sessionId:sid,cwd:CWD,mcpServers:[]})));
 console.log('resume:',P(await B.call('session/resume',{sessionId:sid,cwd:CWD,mcpServers:[]})));
 B.c.kill('SIGTERM'); process.exit(0);
})();
