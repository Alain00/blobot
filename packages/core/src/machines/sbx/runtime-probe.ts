/** Fixed guest code. Request data is argv JSON, never interpolated shell or executable code. */
export const SBX_RUNTIME_PROBE = String.raw`
const {spawnSync}=require('node:child_process');
const request=JSON.parse(process.argv[1]);
let command=request.command,args=request.args;
if(command==='command') {
  if(args.length!==2||args[0]!=='-v')throw Error('Unsupported lookup');
  command='/bin/sh';args=['-c','command -v "$1"','blobot-runtime-probe',args[1]];
}
const result=spawnSync(command,args,{cwd:'/home/agent',encoding:'utf8',timeout:request.timeoutMs,maxBuffer:262144});
if(result.error||result.signal||!Number.isInteger(result.status))throw Error('Runtime probe unavailable');
console.log(JSON.stringify({protocol:'blobot-runtime-probe-v1',code:result.status,stdout:result.stdout,stderr:''}));
`;
