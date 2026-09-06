// Read-only evidence collection: static help, executable metadata and version.
// Does not create/start/stop/remove sandboxes or call any private daemon endpoint.
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { sbxClientEnvironment } from '../../../packages/core/dist/machines/sbx/client-environment.js';
const executable = realpathSync('/opt/homebrew/bin/sbx');
const env = sbxClientEnvironment();
const commands = [[],['create'],['run'],['kit','add'],['kit','inspect'],['env'],['env','create'],['env','run'],['env','plan'],['template'],['template','save'],['template','load'],['move'],['volume'],['settings'],['daemon']];
const results = commands.map(command => ({args:[...command,'--help'],stdout:execFileSync(executable,[...command,'--help'],{env,encoding:'utf8',timeout:10000,maxBuffer:1024**2})}));
const strings = execFileSync('/usr/bin/strings',[executable],{encoding:'utf8',timeout:10000,maxBuffer:64*1024**2});
const apiSymbols = [...new Set(strings.split('\n').filter(s => /^github\.com\/docker\/sandboxes\/sandboxapi\.\(\*Client\)\./.test(s) && /Update|Resize|Recreate|Clone|Snapshot|Save|Volume|Sandbox|Resource|CPU|Memory|Config|Disk|Checkpoint|Swap/.test(s)))];
const report = {date:new Date().toISOString(),executable,sha256:createHash('sha256').update(readFileSync(executable)).digest('hex'),
  version:JSON.parse(execFileSync(executable,['version','--json'],{env,encoding:'utf8',timeout:10000})),
  publicKitCommit:'21e1928b5fe0036163307ea8047e48390f2d6fec',commands:results,apiSymbols,
  scope:{createdBoxes:0,startedBoxes:0,privateEndpointCalls:0,globalMutations:0,providerCalls:0,credentialsRead:0}};
writeFileSync(new URL('./61-native-resize-readonly-results.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({version:report.version,sha256:report.sha256,helpCommands:results.length,apiSymbols,scope:report.scope}));
