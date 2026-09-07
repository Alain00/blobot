// Offline assertions over synthetic recorded evidence. Never starts sbx.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const base = new URL('./', import.meta.url);
const report = JSON.parse(await readFile(new URL('58-attributes-results.json', base)));
let checks = 0;
const equal = (a,b) => { assert.deepEqual(a,b); checks++; };
const yes = a => { assert(a); checks++; };
equal(report.passed,true); equal(report.cleanup,{errors:[],remainingOwnedBoxes:[],remainingOwnedImages:[],tempRemoved:true});
equal(report.guests.length,1); equal(report.guests[0].code,0);
const guest = report.guests[0].guest, p = guest.probe;
equal(guest.completed,true); equal(guest.probeStderr,''); equal(guest.probeExit,0);
for (const value of Object.values(guest.checks)) equal(value,true);
equal(p.completed,true); equal(p.cleanup,{errors:[],syntheticTreesRemoved:true});
equal(p.kernel,'7.0.12'); equal(p.archive.bytes,20480);
for (const [file,key] of [['58-attributes-worker.cjs','workerSha256'],['58-attributes-probe.py','probeSha256']])
  equal(createHash('sha256').update(await readFile(new URL(file,base))).digest('hex'),report.scripts[key]);
for (const row of report.diskChecks) yes(BigInt(row.availableBytes)>=2n*1024n**3n);
yes(BigInt(report.minimumObservedSpace)>=2n*1024n**3n);
equal(p.restores.length,3);
for (const row of p.restores) {
  equal(row.tar,{code:0,stderr:''}); equal(row.sourceUnchanged,true);
  equal(row.mismatchedMembers,row.strategy==='direct'?['plain','acl']:[]);
  equal(row.rearchiveEqualsSource,row.strategy!=='direct');
  for (const name of ['plain','acl']) {
    equal(row.afterTar[name].xattrs['user.extra'],row.strategy==='prune-before'?undefined:'7461726765742d6f6e6c79');
    // ACLs themselves are exact after tar, even before explicit xattr pruning.
    for (const acl of ['system.posix_acl_access','system.posix_acl_default'])
      equal(row.afterTar[name].xattrs[acl],p.source[name].xattrs[acl]);
    equal(row.afterTar[name].mode,p.source[name].mode);
    equal(row.afterTar[name].mtimeNs,p.source[name].mtimeNs);
  }
  for (const removed of [...row.prePruned,...row.postPruned]) {
    equal(removed.modePreserved,true); equal(removed.mtimePreserved,true); equal(removed.ctimeChanged,true);
  }
}
equal(p.restores[1].prePruned.map(x=>x.xattr),['system.posix_acl_access','system.posix_acl_default','user.extra','user.extra']);
equal(p.restores[2].postPruned.map(x=>x.xattr),['user.extra','user.extra']);
const expected = [['baseline',0x80000,0],['immutable',0x80010,8],['append',0x80020,16],['nodump',0x80040,128],['noatime',0x80080,64],['sync',0x80008,32],['dirsync',0x90000,0],['topdir',0xa0000,0],['projinherit',0x20080000,512],['combined',0x200b00f8,760]];
equal(p.flags.length,expected.length);
for (let i=0;i<expected.length;i++) {
  const [name,flags,xflags] = expected[i], row=p.flags[i];
  equal(row.name,name); equal(row.sourceSet.ok,true); equal(row.targetSet.ok,true);
  equal(row.source,{flags,fsx:{xflags,extsize:0,nextents:0,projid:0,cowextsize:0}}); equal(row.target,row.source);
  equal(row.sourceRequestedFlagsExact,true); equal(row.targetBothApisEqual,true);
  equal(row.singleTargetSetflagsCall,true); equal(row.modeMtimeUnchanged,true);
  equal(row.statxSource,row.statxTarget);
}
equal(p.fileAttrReadControls.length,7);
for (const row of p.fileAttrReadControls) {
  const supported=['new-file','new-dir'].includes(row.label);
  equal(row.fileGetattr,supported?{ok:true,value:[0,0,0,0,0]}:{ok:false,errno:95});
  if (row.label.startsWith('base-')) equal(row.statx,{attributes:'16',mask:'2109492'});
}
equal(p.specials.length,2);
for (const row of p.specials) {
  equal(row.dataDescriptorsOpened,0); equal(row.referentUnchanged,true);
  for (const outcome of Object.values(row.opathIoctls)) equal(outcome,{ok:false,errno:9});
  equal(row.fileGetattr,{ok:false,errno:95}); equal(row.fileSetattrNodump,{skipped:'getter unavailable'});
  equal(row.fileGetattrAfterSet,null); equal(row.fileSetattrRevert,null);
  equal(row.xattrMutations[0].set,{ok:false,errno:1});
  equal(row.xattrMutations[1].set.ok,true); equal(row.xattrMutations[1].remove.ok,true);
  equal(row.xattrMutations[1].readHex,'6f776e2d73796e746865746963');
  for (const key of ['mode','uid','gid','mtimeNs','ino','xattrs','statx']) equal(row.after[key],row.before[key]);
}
console.log(JSON.stringify({passed:true,assertions:checks}));
