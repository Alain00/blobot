import { spawn } from 'node:child_process';
import fs from 'node:fs';
const CWD=process.env.PROJ, OUT=process.env.OUT;
const log=fs.createWriteStream(OUT,{flags:'w'});
const c=spawn('/home/alain/.opencode/bin/opencode',['acp'],{cwd:CWD,stdio:['pipe','pipe','pipe'],env:{...process.env,NO_COLOR:'1'}});
c.stderr.on('data',d=>log.write('STDERR '+d));
let id=1,buf='';const pend=new Map();
c.stdout.on('data',d=>{buf+=d;let i;while((i=buf.indexOf('\n'))>=0){const l=buf.slice(0,i);buf=buf.slice(i+1);if(!l.trim())continue;let m;try{m=JSON.parse(l)}catch{continue}
 if(m.id!==undefined&&!m.method){const p=pend.get(m.id);pend.delete(m.id);if(p)p(m.error?{__error:m.error}:{ok:m.result});}
 else if(m.method==='session/update'){const u=m.params.update;if(u.sessionUpdate!=='available_commands_update')log.write('UPDATE '+JSON.stringify(u)+'\n');}
 else if(m.id!==undefined){log.write('REQ '+JSON.stringify(m)+'\n');c.stdin.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{outcome:{outcome:'selected',optionId:'once'}}})+'\n');}}});
const call=(method,params)=>{const i=id++;c.stdin.write(JSON.stringify({jsonrpc:'2.0',id:i,method,params})+'\n');
 return new Promise(r=>{pend.set(i,r);setTimeout(()=>{if(pend.has(i)){pend.delete(i);r({__timeout:true})}},90000)});};
const P=o=>o===undefined?'undefined':JSON.stringify(o).slice(0,600);
(async()=>{
 await call('initialize',{protocolVersion:1,clientCapabilities:{fs:{readTextFile:true,writeTextFile:true},terminal:false}});
 const s=await call('session/new',{cwd:CWD,mcpServers:[{name:'blobot',command:process.execPath,args:[process.env.SRV],env:[]}]});
 console.log('session/new:',s.__error?('ERR '+P(s.__error)):('ok sid='+s.ok.sessionId));
 if(s.__error){c.kill();process.exit(0);}
 const r=await call('session/prompt',{sessionId:s.ok.sessionId,prompt:[{type:'text',text:'Use the blobot_ping tool with who="alain" and tell me exactly what it returned.'}]});
 console.log('prompt:',P(r));
 c.kill('SIGTERM');process.exit(0);
})();
