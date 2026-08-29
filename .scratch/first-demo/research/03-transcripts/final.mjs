import { spawn } from 'node:child_process';
const CWD=process.env.PROJ;
const c=spawn('/home/alain/.opencode/bin/opencode',['acp'],{cwd:CWD,stdio:['pipe','pipe','pipe'],env:{...process.env,NO_COLOR:'1'}});
c.stderr.on('data',()=>{});
let id=1,buf='';const pend=new Map();const upd=[];
c.stdout.on('data',d=>{buf+=d;let i;while((i=buf.indexOf('\n'))>=0){const l=buf.slice(0,i);buf=buf.slice(i+1);if(!l.trim())continue;let m;try{m=JSON.parse(l)}catch{continue}
 if(m.id!==undefined&&!m.method){const p=pend.get(m.id);pend.delete(m.id);if(p)p(m.error?{__error:m.error}:{ok:m.result});}
 else if(m.method==='session/update'){const u=m.params.update;if(u.sessionUpdate!=='available_commands_update')upd.push(u);}
 else if(m.id!==undefined){c.stdin.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{outcome:{outcome:'selected',optionId:'once'}}})+'\n');}}});
const call=(m,p)=>{const i=id++;c.stdin.write(JSON.stringify({jsonrpc:'2.0',id:i,method:m,params:p})+'\n');
 return new Promise(r=>{pend.set(i,r);setTimeout(()=>{if(pend.has(i)){pend.delete(i);r({__timeout:true})}},90000)});};
const P=o=>o===undefined?'undefined':JSON.stringify(o).slice(0,900);
(async()=>{
 await call('initialize',{protocolVersion:1,clientCapabilities:{fs:{readTextFile:true,writeTextFile:true},terminal:false}});
 const s=await call('session/new',{cwd:CWD,mcpServers:[]}); const sid=s.ok.sessionId;
 // 1) mode switch -> does it emit current_mode_update?
 let n=upd.length;
 console.log('set_mode plan:',P(await call('session/set_mode',{sessionId:sid,modeId:'plan'})));
 await new Promise(r=>setTimeout(r,600));
 console.log('  updates after set_mode:',JSON.stringify(upd.slice(n)).slice(0,400));
 n=upd.length;
 console.log('set_config_option mode=build:',P(await call('session/set_config_option',{sessionId:sid,configId:'mode',value:'build'})).slice(0,80));
 await new Promise(r=>setTimeout(r,600));
 console.log('  updates after set_config_option:',JSON.stringify(upd.slice(n).map(u=>u.sessionUpdate)));
 // 2) genuine tool failure
 n=upd.length;
 console.log('prompt:',P(await call('session/prompt',{sessionId:sid,prompt:[{type:'text',text:'Read the file /definitely/does/not/exist.txt using the read tool. Report the error.'}]})));
 for(const u of upd.slice(n)) if(/tool_call/.test(u.sessionUpdate)) console.log('  ',JSON.stringify(u).slice(0,600));
 // 3) concurrent prompt while one in flight
 n=upd.length;
 const p1=call('session/prompt',{sessionId:sid,prompt:[{type:'text',text:'Run `sleep 20 && echo A`.'}]});
 await new Promise(r=>setTimeout(r,3000));
 const p2=call('session/prompt',{sessionId:sid,prompt:[{type:'text',text:'Say B.'}]});
 console.log('concurrent p2:',P(await p2));
 console.log('concurrent p1:',P(await p1));
 c.kill('SIGTERM');process.exit(0);
})();
