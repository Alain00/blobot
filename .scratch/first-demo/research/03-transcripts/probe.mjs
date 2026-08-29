import { spawn } from 'node:child_process';
const CWD = process.env.PROJ;
const child = spawn('/home/alain/.opencode/bin/opencode', ['acp'], { cwd: CWD, stdio:['pipe','pipe','pipe'], env:{...process.env,NO_COLOR:'1'} });
child.stderr.on('data',()=>{});
let nextId=1; const pending=new Map(); let buf='';
const sink=[];
child.stdout.on('data',d=>{buf+=d;let i;while((i=buf.indexOf('\n'))>=0){const l=buf.slice(0,i);buf=buf.slice(i+1);if(!l.trim())continue;let m;try{m=JSON.parse(l)}catch{continue}
 if(m.id!==undefined&&!m.method){const p=pending.get(m.id);pending.delete(m.id);if(p)p(m.error?{__error:m.error}:{ok:m.result});}
 else if(m.method==='session/update'){sink.push(m.params.update.sessionUpdate);}
 else if(m.id!==undefined){child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{outcome:{outcome:'selected',optionId:'once'}}})+'\n');}
}});
function call(method,params){const id=nextId++;child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');
 return new Promise(r=>{pending.set(id,r);setTimeout(()=>{if(pending.has(id)){pending.delete(id);r({__timeout:true})}},20000)});}
const P=o=>JSON.stringify(o).slice(0,700);
(async()=>{
  console.log('init:',P(await call('initialize',{protocolVersion:1,clientCapabilities:{fs:{readTextFile:true,writeTextFile:true},terminal:false}})));
  const s1=await call('session/new',{cwd:CWD,mcpServers:[]});
  const sid=s1.ok.sessionId; console.log('sid1:',sid);
  // second session with different cwd in SAME process
  const alt = process.env.PROJ2;
  const s2=await call('session/new',{cwd:alt,mcpServers:[]});
  console.log('sid2:',s2.ok?s2.ok.sessionId:P(s2));
  // probe method names
  const probes=[
    ['session/list',{}],
    ['session/load',{sessionId:sid,cwd:CWD,mcpServers:[]}],
    ['session/resume',{sessionId:sid}],
    ['session/fork',{sessionId:sid}],
    ['session/close',{sessionId:sid}],
    ['session/set_mode',{sessionId:sid,modeId:'plan'}],
    ['session/set_model',{sessionId:sid,modelId:'x'}],
    ['session/set_config_option',{sessionId:sid,optionId:'mode',value:'plan'}],
    ['session/select_config_option',{sessionId:sid,optionId:'mode',value:'plan'}],
    ['session/config',{sessionId:sid}],
    ['session/request_permission',{}],
    ['fs/read_text_file',{}],
    ['terminal/create',{}],
    ['authenticate',{methodId:'opencode-login'}],
  ];
  for(const [m,p] of probes){ const r=await call(m,p); console.log('PROBE',m,'=>',P(r)); }
  // bad cwd
  console.log('badcwd:',P(await call('session/new',{cwd:'/nonexistent/path/xyz',mcpServers:[]})));
  console.log('relcwd:',P(await call('session/new',{cwd:'relative/path',mcpServers:[]})));
  console.log('nocwd:',P(await call('session/new',{mcpServers:[]})));
  console.log('updates seen:',[...new Set(sink)].join(','));
  child.kill('SIGTERM'); process.exit(0);
})();
