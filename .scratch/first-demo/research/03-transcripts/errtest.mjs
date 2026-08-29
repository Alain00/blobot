import { spawn } from 'node:child_process';
const CWD=process.env.PROJ;
function mk(){const c=spawn('/home/alain/.opencode/bin/opencode',['acp'],{cwd:CWD,stdio:['pipe','pipe','pipe'],env:{...process.env,NO_COLOR:'1'}});
 let id=1,buf='';const pend=new Map();const upd=[];const errs=[];
 c.stderr.on('data',d=>errs.push(String(d)));
 c.stdout.on('data',d=>{buf+=d;let i;while((i=buf.indexOf('\n'))>=0){const l=buf.slice(0,i);buf=buf.slice(i+1);if(!l.trim())continue;let m;try{m=JSON.parse(l)}catch{upd.push({UNPARSED:l});continue}
  if(m.id!==undefined&&!m.method){const p=pend.get(m.id);pend.delete(m.id);if(p)p(m.error?{__error:m.error}:{ok:m.result});}
  else if(m.method==='session/update'){upd.push(m.params.update);}
  else if(m.id!==undefined){c.stdin.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{outcome:{outcome:'selected',optionId:'once'}}})+'\n');}}});
 const call=(m,p)=>{const i=id++;c.stdin.write(JSON.stringify({jsonrpc:'2.0',id:i,method:m,params:p})+'\n');
  return new Promise(r=>{pend.set(i,r);setTimeout(()=>{if(pend.has(i)){pend.delete(i);r({__timeout:true})}},60000)});};
 return {c,call,upd,errs,raw:s=>c.stdin.write(s)};}
const P=o=>o===undefined?'undefined':JSON.stringify(o).slice(0,600);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const A=mk();
 await A.call('initialize',{protocolVersion:1,clientCapabilities:{fs:{},terminal:false}});
 // malformed JSON
 A.raw('this is not json\n'); await sleep(800);
 console.log('after malformed, still alive?', A.c.exitCode===null, 'unparsed stdout:', P(A.upd.filter(u=>u.UNPARSED)));
 console.log('ping after malformed:', P(await A.call('session/list',{})));
 // bad protocol version
 console.log('init v99:', P(await A.call('initialize',{protocolVersion:99,clientCapabilities:{}})));
 // model error: invalid model
 const s=await A.call('session/new',{cwd:CWD,mcpServers:[]});
 const sid=s.ok.sessionId;
 console.log('set bad model:', P(await A.call('session/set_config_option',{sessionId:sid,configId:'model',value:'notaprovider/notamodel'})));
 const r=await A.call('session/prompt',{sessionId:sid,prompt:[{type:'text',text:'hi'}]});
 console.log('prompt w/ bad model:', P(r));
 console.log('  updates:', A.upd.filter(u=>!u.UNPARSED).map(u=>u.sessionUpdate).filter(x=>x!=='available_commands_update').join(','));
 console.log('  stderr:', P(A.errs.join('').slice(-800)));
 // empty prompt array
 console.log('empty prompt:', P(await A.call('session/prompt',{sessionId:sid,prompt:[]})));
 A.c.kill('SIGTERM'); await sleep(500);
 // stdin close behaviour
 const B=mk();
 await B.call('initialize',{protocolVersion:1,clientCapabilities:{fs:{},terminal:false}});
 B.c.stdin.end(); await sleep(3000);
 console.log('after stdin close: exitCode=',B.c.exitCode,'signal=',B.c.signalCode);
 B.c.kill('SIGKILL');
 process.exit(0);
})();
