// ACP stdio driver for the codex-acp bridge (adapted from 16-transcripts/acp.mjs, which was
// adapted from 03-transcripts/drive.mjs). Same STEPS protocol, so the three runtimes are
// probed by one shape of script.
//
// The bridge is a node program, spawned the way `adapters/acp/npm-bridge.ts` spawns it:
// process.execPath, the pinned dependency's dist/index.js, CODEX_PATH at a real binary.
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const OUT = process.env.OUT || '/tmp/codex01/out.jsonl';
const CWD = process.env.PROJ;
const STEPS = JSON.parse(process.env.STEPS || '[]');
const BRIDGE = process.env.BRIDGE;
const log = fs.createWriteStream(OUT, { flags: 'w' });
const t0 = Date.now();
const rec = (dir, msg, note) => log.write(JSON.stringify({ t: Date.now()-t0, dir, ...(note?{note}:{}), msg })+'\n');

const env = { ...process.env, NO_COLOR: '1', NO_BROWSER: '1' };
delete env.STEPS; delete env.OUT; delete env.PROJ; delete env.BRIDGE;
const child = spawn(process.execPath, [BRIDGE], {
  cwd: CWD, stdio: ['pipe','pipe','pipe'], env,
});
child.stderr.on('data', d => rec('stderr', String(d)));
child.on('exit', (c,s) => { rec('exit', {code:c,signal:s}); log.end(); });

let nextId = 1; const pending = new Map();
const send = o => { rec('out', o); child.stdin.write(JSON.stringify(o)+'\n'); };
const call = (method, params) => { const id = nextId++; send({jsonrpc:'2.0',id,method,params});
  return new Promise((res,rej)=>pending.set(id,{res,rej})); };
const respond=(id,result)=>send({jsonrpc:'2.0',id,result});
const respondErr=(id,error)=>send({jsonrpc:'2.0',id,error});

let text = '';
const toolCalls = [];
const permissions = [];
let buf='';
child.stdout.on('data', d => { buf += d.toString(); let i;
  while ((i=buf.indexOf('\n'))>=0) { const line=buf.slice(0,i); buf=buf.slice(i+1);
    if(!line.trim()) continue; let m; try{m=JSON.parse(line);}catch{ rec('in-unparsed', line); continue; }
    rec('in', m);
    if (m.id!==undefined && m.method===undefined) { const p=pending.get(m.id); pending.delete(m.id);
      if(p)(m.error?p.rej(m.error):p.res(m.result)); }
    else if (m.method) handleRequest(m);
  }});

function handleRequest(m){ const {method,params,id}=m;
  if(method==='session/update'){ const u=params.update;
    if(u && u.sessionUpdate==='agent_message_chunk' && u.content?.type==='text') text += u.content.text;
    if(u && (u.sessionUpdate==='tool_call' || u.sessionUpdate==='tool_call_update'))
      toolCalls.push({k:u.sessionUpdate,id:u.toolCallId,kind:u.kind,title:u.title,status:u.status,locations:u.locations});
    return; }
  if(id===undefined) return;
  if(method==='session/request_permission'){
    permissions.push({toolCall:params.toolCall?.title, options:(params.options||[]).map(o=>o.optionId+':'+o.kind), meta:params._meta});
    // The research client answers whatever PERM says: 'allow' (the default) or 'reject'.
    const opts=params.options||[];
    const want = process.env.PERM==='reject' ? /reject|deny/i : /allow_once|allow/i;
    const pick=opts.find(o=>want.test((o.kind||'')+(o.optionId||'')))||opts[0];
    respond(id,{outcome:{outcome:'selected',optionId:pick&&pick.optionId}}); return; }
  if(method==='fs/read_text_file'){ try{respond(id,{content:fs.readFileSync(params.path,'utf8')});}catch(e){respondErr(id,{code:-32603,message:String(e)});} return; }
  if(method==='fs/write_text_file'){ try{fs.writeFileSync(params.path,params.content); respond(id,null);}catch(e){respondErr(id,{code:-32603,message:String(e)});} return; }
  respondErr(id,{code:-32601,message:'Method not found: '+method});
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const results = {};
(async()=>{
 try{
  const init = await call('initialize',{protocolVersion:1,clientCapabilities:{fs:{readTextFile:true,writeTextFile:true},terminal:false}});
  rec('note',init,'initialize'); results.initialize = init;
  let sessionId = process.env.SESSION_ID || null;
  for (const step of STEPS) {
    if (step.op==='new'){ const r = await call('session/new',{cwd:CWD,mcpServers:[],...(step.params||{})}).catch(e=>({__error:e}));
      rec('note',r,'session/new result'); results.newSession=r; sessionId=r.sessionId||sessionId; }
    else if (step.op==='load'){ const r = await call('session/load',{cwd:CWD,mcpServers:[],sessionId,...(step.params||{})}).catch(e=>({__error:e}));
      rec('note',r,'session/load result'); results.loadSession=r; }
    else if (step.op==='setmode'){ const r = await call('session/set_mode',{sessionId,modeId:step.modeId}).catch(e=>({__error:e}));
      rec('note',r,'session/set_mode result'); results.setMode=r; }
    else if (step.op==='setopt'){ const r = await call('session/set_config_option',{sessionId,configId:step.configId,value:step.value}).catch(e=>({__error:e}));
      rec('note',r,'set_config_option result'); results['setopt_'+step.configId]=r; }
    else if (step.op==='prompt'){ text=''; toolCalls.length=0; permissions.length=0;
      const r = await call('session/prompt',{sessionId,prompt:[{type:'text',text:step.text}]}).catch(e=>({__error:e}));
      rec('note',{stop:r,answer:text},'prompt result: '+step.label);
      results['answer_'+step.label]=text.trim(); results['stop_'+step.label]=r;
      if(toolCalls.length) results['tools_'+step.label]=toolCalls.slice();
      if(permissions.length) results['perm_'+step.label]=permissions.slice(); }
    else if (step.op==='raw'){ const r = await call(step.method, step.params).catch(e=>({__error:e}));
      rec('note',r,'raw '+step.method); results['raw_'+step.method]=r; }
  }
  results.sessionId = sessionId;
 }catch(e){ rec('note',{fatal:String(e)},'driver error'); results.fatal=String(e); }
 console.log(JSON.stringify(results,null,1));
 await sleep(300); child.kill('SIGTERM'); await sleep(400); process.exit(0);
})();
