# Two strictly synthetic trees under a production-held private rootfs view.
import os,sys,stat,json,hashlib,fcntl,struct,ctypes,subprocess,shutil,traceback
BASE=sys.argv[1]; assert '/rootfs/opt/blobot-attributes58-' in BASE
assert sys.byteorder=='little' and os.uname().machine=='aarch64'
SRC=BASE+'/source';DST=BASE+'/target';T=1700000000123456789
GET,SET,GETX=0x80086601,0x40086602,0x801c581f
libc=ctypes.CDLL(None,use_errno=True);libc.syscall.restype=ctypes.c_long
libc.statx.argtypes=[ctypes.c_int,ctypes.c_char_p,ctypes.c_int,ctypes.c_uint,ctypes.c_void_p]
report={'completed':False,'kernel':os.uname().release,'descriptorPolicy':'data descriptors only for regular files/directories; specials use O_PATH only','cleanup':{}}
cleanup_flags=[]
def attempt(fn):
    try:return {'ok':True,'value':fn()}
    except OSError as e:return {'ok':False,'errno':e.errno}
def xattrs(p):return {n:os.getxattr(p,n,follow_symlinks=False).hex() for n in sorted(os.listxattr(p,follow_symlinks=False))}
def meta(p):
    s=os.lstat(p);r={'mode':s.st_mode,'uid':s.st_uid,'gid':s.st_gid,'mtimeNs':str(s.st_mtime_ns),'ctimeNs':str(s.st_ctime_ns),'ino':str(s.st_ino),'xattrs':xattrs(p)}
    raw=ctypes.create_string_buffer(256)
    if libc.statx(-100,os.fsencode(p),0x100|0x800,0x7ff,raw):r['statx']={'errno':ctypes.get_errno()}
    else:r['statx']={'attributes':str(struct.unpack_from('<Q',raw.raw,8)[0]),'mask':str(struct.unpack_from('<Q',raw.raw,56)[0])}
    if stat.S_ISREG(s.st_mode):
        fd=os.open(p,os.O_RDONLY|os.O_NOATIME|os.O_NOFOLLOW)
        try:r['sha256']=hashlib.sha256(os.read(fd,1048576)).hexdigest()
        finally:os.close(fd)
    if stat.S_ISLNK(s.st_mode):r['link']=os.readlink(p)
    return r
def comparable(r):return {k:v for k,v in r.items() if k in ['mode','uid','gid','mtimeNs','sha256','link','xattrs']}
def ioctls(p,value=None):
    assert stat.S_ISREG(os.lstat(p).st_mode) or stat.S_ISDIR(os.lstat(p).st_mode)
    fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW|os.O_NOATIME|os.O_NONBLOCK)
    try:
        if value is not None:fcntl.ioctl(fd,SET,struct.pack('<I',value))
        a=bytearray(4);fcntl.ioctl(fd,GET,a,True)
        b=bytearray(28);fcntl.ioctl(fd,GETX,b,True)
        return {'flags':struct.unpack('<I',a)[0],'fsx':dict(zip(['xflags','extsize','nextents','projid','cowextsize'],struct.unpack('<5I8x',b)))}
    finally:os.close(fd)
def attrcall(p,value=None):
    # Linux v7.0.12 arm64 scripts/syscall.tbl: file_getattr=468, file_setattr=469.
    b=ctypes.create_string_buffer(24)
    if value is not None:struct.pack_into('<Q4I',b,0,*value)
    n=468 if value is None else 469
    rc=libc.syscall(ctypes.c_long(n),ctypes.c_int(-100),ctypes.c_char_p(os.fsencode(p)),ctypes.byref(b),ctypes.c_size_t(24),ctypes.c_uint(0x100))
    if rc<0:raise OSError(ctypes.get_errno(),'file_attr')
    return list(struct.unpack('<Q4I',b.raw))
def acl(uid):
    return struct.pack('<I',2)+b''.join(struct.pack('<HHI',tag,perm,ident) for tag,perm,ident in [(1,7,0xffffffff),(2,5,uid),(4,5,0xffffffff),(16,5,0xffffffff),(32,0,0xffffffff)])
def seed(root,target):
    os.mkdir(root)
    for name in ['plain','acl']:
        p=root+'/'+name;os.mkdir(p)
        with open(p+'/file','wb') as f:f.write(b'target-old' if target else b'synthetic-source-bytes\n')
        os.setxattr(p,'user.shared',b'target-old' if target else b'source-value')
        if target:os.setxattr(p,'user.extra',b'target-only')
        if target or name=='acl':
            for kind in ['access','default']:os.setxattr(p,'system.posix_acl_'+kind,acl(23456 if target else 12345))
        if name=='plain' and not target:os.chmod(p,0o750)
        os.chmod(p+'/file',0o640);os.utime(p+'/file',ns=(T,T));os.utime(p,ns=(T,T))
    os.mkfifo(root+'/fifo',0o600);os.symlink('plain/file',root+'/symlink')
    for p in [root,root+'/fifo',root+'/symlink']:os.utime(p,ns=(T,T),follow_symlinks=False)
def inventory(root):return {n:meta(root+'/'+n) for n in ['.','plain','plain/file','acl','acl/file','fifo','symlink']}
def tarcreate(root):
    p=subprocess.run(['/usr/bin/tar','-G','--sort=name','--format=pax','--pax-option=exthdr.name=%d/PaxHeaders/%f,delete=atime,delete=ctime','--numeric-owner','--acls','--xattrs','--xattrs-include=*','--sparse','--sparse-version=0.0','--atime-preserve=system','-C',root,'-cf','-','.'],capture_output=True,timeout=10)
    assert p.returncode==0 and p.stderr==b'',(p.returncode,p.stderr);return p.stdout
def restore(data):
    p=subprocess.run(['/usr/bin/tar','-G','--numeric-owner','--acls','--xattrs','--xattrs-include=*','--delay-directory-restore','-C',DST,'-xpf','-'],input=data,capture_output=True,timeout=10)
    return {'code':p.returncode,'stderr':p.stderr.decode()}
def prune():
    changes=[]
    for n in ['.','plain','acl']:
        p=DST+'/'+n;expected=xattrs(SRC+'/'+n)
        for key in sorted(set(xattrs(p))-set(expected)):
            before=meta(p);os.removexattr(p,key,follow_symlinks=False);after=meta(p)
            changes.append({'member':n,'xattr':key,'modePreserved':before['mode']==after['mode'],'mtimePreserved':before['mtimeNs']==after['mtimeNs'],'ctimeChanged':before['ctimeNs']!=after['ctimeNs']})
    return changes
try:
    os.mkdir(BASE);seed(SRC,False)
    source=inventory(SRC);data=tarcreate(SRC)
    report['tarVersion']=subprocess.check_output(['/usr/bin/tar','--version'],text=True).splitlines()[0]
    report['archive']={'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()};report['source']=source;report['restores']=[]
    for strategy in ['direct','prune-before','prune-after']:
        seed(DST,True);before=inventory(DST);pre=prune() if strategy=='prune-before' else []
        extracted=restore(data);after_tar=inventory(DST);post=prune() if strategy=='prune-after' else [];final=inventory(DST)
        report['restores'].append({'strategy':strategy,'tar':extracted,'before':before,'afterTar':after_tar,'final':final,'prePruned':pre,'postPruned':post,
          'mismatchedMembers':[n for n in source if comparable(source[n])!=comparable(final[n])],
          'sourceUnchanged':inventory(SRC)==source,'rearchiveEqualsSource':tarcreate(DST)==data})
        shutil.rmtree(DST)
    # Same two source/target trees; complete xattr trials above precede independent flag probes.
    os.mkdir(DST);os.mkdir(SRC+'/flags');os.mkdir(DST+'/flags')
    report['flags']=[]
    cases=[('baseline',0),('immutable',0x10),('append',0x20),('nodump',0x40),('noatime',0x80),('sync',8),('dirsync',0x10000),('topdir',0x20000),('projinherit',0x20000000),('combined',0x200300f8)]
    for name,bits in cases:
        paths=[root+'/flags/'+name for root in [SRC,DST]]
        for p in paths:os.mkdir(p);os.utime(p,ns=(T,T));cleanup_flags.append(p)
        initial=[ioctls(p) for p in paths];before=[meta(p) for p in paths]
        desired=initial[0]['flags']|bits
        setsource=attempt(lambda:ioctls(paths[0],desired));s=ioctls(paths[0])
        settarget=attempt(lambda:ioctls(paths[1],s['flags']));t=ioctls(paths[1]);after=[meta(p) for p in paths]
        report['flags'].append({'name':name,'requestedFlags':desired,'initial':initial,'sourceSet':setsource,'targetSet':settarget,'source':s,'target':t,
          'sourceRequestedFlagsExact':s['flags']==desired,'targetBothApisEqual':s==t,'singleTargetSetflagsCall':True,
          'modeMtimeUnchanged':all(a['mode']==b['mode'] and a['mtimeNs']==b['mtimeNs'] for a,b in zip(before,after)),
          'statxSource':after[0]['statx'],'statxTarget':after[1]['statx']})
    for p in cleanup_flags:ioctls(p,ioctls(p)['flags']&~0x200300f8)
    cleanup_flags=[]
    # Read-only controls: never copy up or mutate base paths. New controls are owned.
    view=BASE.split('/rootfs/opt/')[0]+'/rootfs'
    report['fileAttrReadControls']=[]
    for label,p in [('base-file',view+'/.rock/metadata.yaml'),('base-dir',view+'/.rock'),('base-symlink',view+'/bin'),('new-file',SRC+'/plain/file'),('new-dir',SRC+'/plain'),('new-symlink',SRC+'/symlink'),('new-fifo',SRC+'/fifo')]:
        a=meta(p)
        report['fileAttrReadControls'].append({'label':label,'mode':a['mode'],'statx':a['statx'],'fileGetattr':attempt(lambda:attrcall(p)),
          'ioctls':attempt(lambda:ioctls(p)) if stat.S_ISREG(a['mode']) or stat.S_ISDIR(a['mode']) else {'skipped':'nonregular; no data descriptor'}})
    report['specials']=[]
    for name in ['fifo','symlink']:
        p=SRC+'/'+name;before=meta(p);referent_before=meta(SRC+'/plain/file')
        fd=os.open(p,os.O_PATH|os.O_NOFOLLOW);op={}
        try:
            for label,request,size in [('getflags',GET,4),('fsgetxattr',GETX,28),('setflagsZero',SET,4)]:
                op[label]=attempt(lambda request=request,size=size:fcntl.ioctl(fd,request,bytearray(size),True))
        finally:os.close(fd)
        getter=attempt(lambda:attrcall(p));setter={'skipped':'getter unavailable'};readback=None;revert=None
        if getter['ok']:
            original=getter['value'];wanted=original.copy();wanted[0]|=0x80
            setter=attempt(lambda:attrcall(p,wanted));readback=attempt(lambda:attrcall(p))
            if setter['ok']:revert=attempt(lambda:attrcall(p,original));assert revert['ok']
        mutations=[]
        for namespace in ['user','trusted']:
            key=namespace+'.blobot58';result=attempt(lambda:os.setxattr(p,key,b'own-synthetic',follow_symlinks=False));read=None;removed=None
            if result['ok']:
                read=os.getxattr(p,key,follow_symlinks=False).hex();removed=attempt(lambda:os.removexattr(p,key,follow_symlinks=False));assert removed['ok']
            mutations.append({'namespace':namespace,'set':result,'readHex':read,'remove':removed})
        report['specials'].append({'type':name,'before':before,'after':meta(p),'opathIoctls':op,'fileGetattr':getter,'fileSetattrNodump':setter,'fileGetattrAfterSet':readback,'fileSetattrRevert':revert,'xattrMutations':mutations,
          'referentUnchanged':meta(SRC+'/plain/file')==referent_before,'dataDescriptorsOpened':0})
    report['completed']=True
except BaseException as e:report['error']=traceback.format_exc();sys.exitcode=1
finally:
    errors=[]
    for p in cleanup_flags:
        try:ioctls(p,ioctls(p)['flags']&~0x200300f8)
        except BaseException as e:errors.append(str(e))
    try:shutil.rmtree(BASE)
    except BaseException as e:errors.append(str(e))
    report['cleanup']={'errors':errors,'syntheticTreesRemoved':not os.path.lexists(BASE)}
    print(json.dumps(report,separators=(',',':')))
    if not report['completed'] or errors:sys.exit(1)
