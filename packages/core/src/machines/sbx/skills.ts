import { posix } from 'node:path';

/** The image/adapter supplies its native lookup paths; the engine knows no runtime names. */
export function prepareSharedSkillsCommand(guestNode: string, source: string, locations: readonly string[]): string {
  if (locations.length === 0 || locations.some((path) => !path.startsWith('/home/agent/') ||
      posix.normalize(path) !== path || /[\x00-\x1f]/.test(path))) throw new Error('Invalid guest skills locations.');
  const program = `const fs=require('node:fs'),p=require('node:path');
const {source,locations}=${JSON.stringify({ source, locations })};
for(const location of locations){
  let parent='/home/agent';
  for(const part of p.relative(parent,p.dirname(location)).split('/')){
    if(!part)continue;parent=p.join(parent,part);
    try{const s=fs.lstatSync(parent);if(!s.isDirectory()||s.isSymbolicLink())throw Error('Conflicting skills directory');}
    catch(e){if(e.code!=='ENOENT')throw e;fs.mkdirSync(parent,{mode:448});}
  }
  try{const s=fs.lstatSync(location);if(!s.isSymbolicLink()||fs.readlinkSync(location)!==source)throw Error('Conflicting skills path');}
  catch(e){if(e.code!=='ENOENT')throw e;fs.symlinkSync(source,location);}
}`;
  const quote = (value: string) => `'${value.replace(/'/g, "'\\''")}'`;
  return `${quote(guestNode)} -e ${quote(program)}`;
}
