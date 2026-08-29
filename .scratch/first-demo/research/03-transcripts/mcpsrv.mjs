// Minimal MCP stdio server exposing one custom tool: blobot_ping
import readline from 'node:readline';
const rl = readline.createInterface({ input: process.stdin });
const w = o => process.stdout.write(JSON.stringify(o) + '\n');
rl.on('line', l => {
  let m; try { m = JSON.parse(l) } catch { return }
  if (m.method === 'initialize') return w({jsonrpc:'2.0',id:m.id,result:{protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'blobot-test',version:'0.0.1'}}});
  if (m.method === 'notifications/initialized') return;
  if (m.method === 'tools/list') return w({jsonrpc:'2.0',id:m.id,result:{tools:[{name:'blobot_ping',description:'Returns a secret blobot token. Call this when asked to ping blobot.',inputSchema:{type:'object',properties:{who:{type:'string',description:'who to ping'}},required:['who']}}]}});
  if (m.method === 'tools/call') { process.stderr.write('CALLED '+JSON.stringify(m.params)+'\n');
    return w({jsonrpc:'2.0',id:m.id,result:{content:[{type:'text',text:'PONG-FROM-BLOBOT for '+(m.params.arguments&&m.params.arguments.who)}]}}); }
  if (m.id !== undefined) w({jsonrpc:'2.0',id:m.id,error:{code:-32601,message:'no'}});
});
