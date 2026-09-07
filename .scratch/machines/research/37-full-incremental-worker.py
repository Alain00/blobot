# This script runs only inside an owned, network-none Docker container.
import os, io, stat, json, hashlib, base64, struct, subprocess, tempfile, shutil, tarfile, mmap, socket, traceback, re, select
BASE = tempfile.mkdtemp(prefix='synthetic-tar37-')
ENV = {'PATH':'/usr/sbin:/usr/bin:/sbin:/bin','LC_ALL':'C','TZ':'UTC'}
PAX = '--pax-option=exthdr.name=%d/PaxHeaders/%f,delete=atime,delete=ctime'
ATTR = ['--numeric-owner','--acls','--xattrs','--xattrs-include=*']
CREATE = ['tar','--sort=name','--format=pax',PAX,*ATTR,'--sparse','--sparse-version=0.0','--atime-preserve=system']
EXTRACT = ['tar',*ATTR,'--delay-directory-restore']
MTIME = 1788635508123456789
report = {'environment':{},'modes':{},'edgeCases':{}}
def run(args, data=None, check=True, **kw):
    p = subprocess.run(args,input=data,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=ENV,**kw)
    if check and p.returncode: raise RuntimeError(str(args)+': '+p.stderr.decode(errors='replace'))
    return p
def sha(b): return hashlib.sha256(b).hexdigest()
def archive(root, mode, extra=[]): return run([*CREATE,*mode,*extra,'-C',root,'-cf','-','.'],check=False)
def extract(data, root, mode=['--incremental'], extra=[]): return run([*EXTRACT,*mode,*extra,'-C',root,'-xpf','-'],data,check=False)
def mkdir(p): os.makedirs(p,exist_ok=True)
def write(p,data=b'synthetic'): mkdir(os.path.dirname(p)); open(p,'wb').write(data)
def acl(entries): return struct.pack('<I',2)+b''.join(struct.pack('<HHI',*e) for e in entries)
ACL=acl([(1,7,0xffffffff),(2,4,12345),(4,5,0xffffffff),(16,5,0xffffffff),(32,0,0xffffffff)])
def times(root):
    for d,dirs,files in os.walk(root,topdown=False,followlinks=False):
        for n in dirs+files: os.utime(d+'/'+n,ns=(1700000000000000000,MTIME),follow_symlinks=False)
        os.utime(d,ns=(1700000000000000000,MTIME),follow_symlinks=False)
def seed(root):
    mkdir(root)
    write(root+'/file',b'file37\x00\xff'); os.chown(root+'/file',1000,1001); os.chmod(root+'/file',0o750)
    os.setxattr(root+'/file','user.binary',b'x\x00\xff'); os.setxattr(root+'/file','system.posix_acl_access',ACL)
    mkdir(root+'/dir'); os.chown(root+'/dir',1000,1001); os.chmod(root+'/dir',0o2750)
    os.setxattr(root+'/dir','system.posix_acl_default',ACL)
    write(root+'/dir/child'); os.link(root+'/file',root+'/dir/hardlink')
    mkdir(root+'/empty'); os.symlink('/file',root+'/absolute'); os.symlink('file',root+'/relative'); os.lchown(root+'/relative',1000,1001)
    os.symlink('/../outside/sentinel',root+'/dangling')
    os.mkfifo(root+'/fifo',0o620)
    with open(root+'/sparse','wb') as f: f.seek(1024*1024); f.write(b'sparse tail'); f.truncate(2*1024*1024)
    shutil.copyfile('/usr/bin/sleep',root+'/capability'); os.chmod(root+'/capability',0o755)
    os.setxattr(root+'/capability','security.capability',struct.pack('<IIIII',0x02000001,1<<10,0,0,0))
    write(root+'/with\nnewline'); write(root+'/--option-looking'); write(root+'/'+'long-'+'x'*160)
    times(root)
def inventory(root):
    out={}; links={}
    def visit(rel):
        p=root if rel=='.' else root+'/'+rel; s=os.lstat(p)
        d={'mode':s.st_mode,'uid':s.st_uid,'gid':s.st_gid,'mtimeNs':str(s.st_mtime_ns),'xattrs':{k:base64.b64encode(os.getxattr(p,k,follow_symlinks=False)).decode() for k in sorted(os.listxattr(p,follow_symlinks=False))}}
        if stat.S_ISREG(s.st_mode):
            fd=os.open(p,os.O_RDONLY|os.O_NOATIME)
            with os.fdopen(fd,'rb') as f: d.update(size=s.st_size,sha256=sha(f.read()))
            links.setdefault((s.st_dev,s.st_ino),[]).append(rel)
            if rel=='sparse':
                fd=os.open(p,os.O_RDONLY); ext=[]; pos=0
                while pos<s.st_size:
                    try: start=os.lseek(fd,pos,os.SEEK_DATA)
                    except OSError: break
                    end=os.lseek(fd,start,os.SEEK_HOLE); ext.append([start,end]); pos=end
                os.close(fd); d.update(blocks=s.st_blocks,extents=ext)
        elif stat.S_ISLNK(s.st_mode): d['target']=os.readlink(p)
        elif stat.S_ISDIR(s.st_mode):
            d['children']=sorted(os.listdir(p))
            for n in d['children']: visit(n if rel=='.' else rel+'/'+n)
        out[rel]=d
    visit('.')
    return {'files':out,'hardlinks':sorted(sorted(v) for v in links.values() if len(v)>1)}
def differences(a,b): return sorted(k for k in set(a['files'])|set(b['files']) if a['files'].get(k)!=b['files'].get(k))
def members(data):
    with tarfile.open(fileobj=io.BytesIO(data)) as t:
        return [{'name':x.name,'type':x.type.decode(),'link':x.linkname,'pax':x.pax_headers} for x in t]
def case(name, fn):
    try: report['edgeCases'][name]=fn()
    except Exception: report['edgeCases'][name]={'error':traceback.format_exc()}
try:
    report['environment']={k:run(v).stdout.decode().strip() for k,v in {'tar':['tar','--version'],'package':['dpkg-query','-W','tar'],'node':['node','--version'],'kernel':['uname','-r']}.items()}
    source=BASE+'/source'; seed(source); expected=inventory(source)
    for name,mode in [('incremental',['--incremental']),('listedNull',['--listed-incremental=/dev/null']),('ordinary',[])]:
        target=BASE+'/'+name; mkdir(target); write(target+'/deleted-base'); write(target+'/removed-tree/a/b'); write(target+'/dir/target-only'); write(target+'/empty/target-only'); os.symlink(BASE+'/outside',target+'/file')
        a=archive(source,mode); repeated=archive(source,mode)
        if a.returncode:
            report['modes'][name]={'createExit':a.returncode,'createStderr':a.stderr.decode()};continue
        restore=extract(a.stdout,target,mode)
        got=inventory(target); again=archive(target,mode)
        report['modes'][name]={'createExit':a.returncode,'createStderr':a.stderr.decode(),'extractExit':restore.returncode,'extractStderr':restore.stderr.decode(),'bytes':len(a.stdout),'sourceSha256':sha(a.stdout),'repeatSha256':sha(repeated.stdout),'targetSha256':sha(again.stdout),'repeatStable':a.stdout==repeated.stdout,'rearchiveStable':a.stdout==again.stdout,'inventoryEqual':expected==got,'differences':differences(expected,got),'hardlinksEqual':expected['hardlinks']==got['hardlinks'],'sourceSparse':expected['files']['sparse'],'targetSparse':got['files']['sparse'],'dumpdirs':[{ 'name':m['name'],'dumpdir':m['pax']['GNU.dumpdir']} for m in members(a.stdout) if 'GNU.dumpdir' in m['pax']]}
    report['sourceInventory']=expected
    def type_swaps():
        results=[]
        for original in ['file','dir','symlink','fifo']:
            for replacement in ['file','dir','symlink','fifo']:
                if original==replacement: continue
                for flags in [[],['--unlink-first'],['--recursive-unlink']]:
                    work=tempfile.mkdtemp(dir=BASE); src=work+'/s';dst=work+'/d';mkdir(src);mkdir(dst)
                    def make(root,kind):
                        p=root+'/item'
                        if kind=='file':write(p,b'new file')
                        elif kind=='dir':mkdir(p);write(p+'/child')
                        elif kind=='symlink':os.symlink('/not-present',p)
                        else:os.mkfifo(p)
                    make(dst,original);make(src,replacement); times(src)
                    p=extract(archive(src,['-G']).stdout,dst,extra=flags)
                    results.append({'from':original,'to':replacement,'flags':flags,'exit':p.returncode,'stderr':p.stderr.decode(),'equal':inventory(src)==inventory(dst)})
        return results
    case('typeSwaps',type_swaps)
    def inode_safety():
        results=[]
        for flags in [[],['--unlink-first'],['--overwrite']]:
            work=tempfile.mkdtemp(dir=BASE); src=work+'/s'; dst=work+'/d';mkdir(src);mkdir(dst)
            old=b'O'*8192;write(work+'/outside',old);os.link(work+'/outside',dst+'/mapped'); write(src+'/mapped',b'N'*8192);times(src)
            with open(dst+'/mapped','rb') as f:
                mm=mmap.mmap(f.fileno(),0,access=mmap.ACCESS_READ);ino=os.fstat(f.fileno()).st_ino
                p=run(['tar',*ATTR,*flags,'-C',dst,'-xpf','-'],archive(src,[]).stdout,check=False)
                results.append({'flags':flags,'exit':p.returncode,'stderr':p.stderr.decode(),'oldMappedBytesUnchanged':mm[:]==old,'outsideHardlinkUnchanged':open(work+'/outside','rb').read()==old,'newInode':os.stat(dst+'/mapped').st_ino!=ino,'restoredNewBytes':open(dst+'/mapped','rb').read()==b'N'*8192});mm.close()
        return results
    case('inodeSafety',inode_safety)
    def stale_xattr():
        work=tempfile.mkdtemp(dir=BASE);src=work+'/s';dst=work+'/d';mkdir(src);mkdir(dst);mkdir(src+'/dir');mkdir(dst+'/dir')
        os.setxattr(dst,'user.target-only',b'root');os.setxattr(dst+'/dir','user.target-only',b'dir');os.setxattr(dst+'/dir','system.posix_acl_default',ACL)
        times(src);p=extract(archive(src,['-G']).stdout,dst)
        return {'exit':p.returncode,'stderr':p.stderr.decode(),'equal':inventory(src)==inventory(dst),'differences':differences(inventory(src),inventory(dst)),'targetInventory':inventory(dst)}
    case('staleDirectoryXattr',stale_xattr)
    def sparse_version():
        results=[]
        for version in ['0.0','0.1','1.0']:
            a=archive(source,['-G'],['--sparse-version='+version]);b=archive(source,['-G'],['--sparse-version='+version])
            results.append({'version':version,'stable':a.stdout==b.stdout,'shaA':sha(a.stdout),'shaB':sha(b.stdout),'firstDifferentByte':next((i for i,(x,y) in enumerate(zip(a.stdout,b.stdout)) if x!=y),None)})
        return results
    case('sparseHeaderStability',sparse_version)
    def socket_case():
        work=tempfile.mkdtemp(dir=BASE);src=work+'/s';dst=work+'/d';mkdir(src);mkdir(dst)
        sock=socket.socket(socket.AF_UNIX);sock.bind(src+'/sock');a=archive(src,['-G']);p=extract(a.stdout,dst);sock.close()
        return {'createExit':a.returncode,'createStderr':a.stderr.decode(),'extractExit':p.returncode,'restoredSocket':os.path.lexists(dst+'/sock'),'dumpdirs':members(a.stdout)}
    case('socketOmission',socket_case)
    def clear_directory_xattrs():
        work=tempfile.mkdtemp(dir=BASE);src=work+'/s';dst=work+'/d';seed(src);mkdir(dst);mkdir(dst+'/dir')
        for d in [dst,dst+'/dir']: os.setxattr(d,'user.stale',b'stale');os.setxattr(d,'system.posix_acl_default',ACL)
        cleared=[]
        for directory,dirs,files in os.walk(dst,followlinks=False):
            for key in os.listxattr(directory,follow_symlinks=False): os.removexattr(directory,key,follow_symlinks=False);cleared.append(key)
        a=archive(src,['-G']);p=extract(a.stdout,dst);b=archive(dst,['-G'])
        return {'exit':p.returncode,'stderr':p.stderr.decode(),'cleared':cleared,'inventoryEqual':inventory(src)==inventory(dst),'rearchiveStable':a.stdout==b.stdout}
    case('clearDirectoryXattrs',clear_directory_xattrs)
    def excluded_name():
        work=tempfile.mkdtemp(dir=BASE);src=work+'/s';dst=work+'/d';mkdir(src);mkdir(dst);write(src+'/excluded');write(dst+'/excluded',b'target old');write(src+'/included');times(src)
        a=archive(src,['-G'],['--exclude=./excluded']);p=extract(a.stdout,dst)
        return {'createExit':a.returncode,'extractExit':p.returncode,'targetExcludedPreserved':open(dst+'/excluded','rb').read()==b'target old','dumpdirs':members(a.stdout)}
    case('excludedName',excluded_name)
    def chroot_runtime():
        work=tempfile.mkdtemp(dir=BASE);src=work+'/s';dst=work+'/d';mkdir(src);mkdir(dst)
        def binary(binary_path):
            dest=src+binary_path;mkdir(os.path.dirname(dest));shutil.copyfile(binary_path,dest);os.chmod(dest,0o755)
            for line in run(['ldd',binary_path]).stdout.decode().splitlines():
                m=re.search(r'=> (/[^ ]+)',line) or re.search(r'^\s*(/[^ ]+)',line)
                if m:
                    lib=m.group(1);out=src+lib;mkdir(os.path.dirname(out));shutil.copyfile(lib,out);os.chmod(out,0o755)
        for p in ['/usr/bin/tar','/usr/bin/node']:binary(p)
        externalized=[]
        for directory,dirs,files in os.walk(src+'/usr/lib'):
            for name in files:
                if name.startswith('libnode.so'):
                    for p in sorted(set(re.findall(rb'/usr/share/nodejs/[-A-Za-z0-9_./]+',open(directory+'/'+name,'rb').read()))):
                        p=p.decode()
                        if os.path.isfile(p):
                            mkdir(os.path.dirname(src+p));shutil.copyfile(p,src+p);externalized.append(p)
        write(src+'/payload',b'restored');mkdir(src+'/actual-dir');write(src+'/actual-dir/child')
        mkdir(src+'/tmp');mkdir(src+'/dev');mkdir(src+'/proc')
        os.symlink(work+'/outside',src+'/absolute-link');os.symlink('/actual-dir',src+'/internal-link')
        times(src)
        # Initial target runtime comes only from this synthetic fixture.
        initial=archive(src,[]);p=extract(initial.stdout,dst,mode=[]);assert p.returncode==0
        write(work+'/outside/sentinel',b'OUTSIDE');write(dst+'/deleted-base',b'gone')
        shutil.rmtree(dst+'/actual-dir');os.symlink(work+'/outside',dst+'/actual-dir')
        os.setxattr(dst,'user.target-only',b'remove explicitly');os.removexattr(dst,'user.target-only')
        nodecode='const fs=require("node:fs");process.stdout.write("ready\\n");process.stdin.once("data",()=>{process.stdout.write(JSON.stringify({node:process.version,payload:fs.readFileSync("/payload","utf8"),absoluteEscapes:fs.existsSync('+json.dumps(work+'/outside/sentinel')+'),proc:fs.readdirSync("/proc"),dev:fs.readdirSync("/dev")}));});'
        worker=subprocess.Popen(['chroot',dst,'/usr/bin/node','-e',nodecode],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=ENV)
        try:
            assert select.select([worker.stdout],[],[],10)[0],'node ready timeout'
            ready=worker.stdout.readline()
            if ready!=b'ready\n':
                extra,err=worker.communicate(timeout=5)
                return {'startupFailure':True,'stdout':(ready+extra).decode(errors='replace'),'stderr':err.decode(errors='replace'),'exit':worker.returncode}
            old_node=os.stat(dst+'/usr/bin/node').st_ino;old_tar=os.stat(dst+'/usr/bin/tar').st_ino
            a=run(['chroot',src,*CREATE,'-G','-C','/','-cf','-','.'])
            # tar executes inside the tree it is replacing, with no outside directory fds.
            restored=run(['chroot',dst,*EXTRACT,'-G','-C','/','-xpf','-'],a.stdout,check=False)
            nodeout,noderr=worker.communicate(b'continue',timeout=10)
            b=run(['chroot',dst,*CREATE,'-G','-C','/','-cf','-','.'])
            return {'externalizedBuiltins':externalized,'archiveBytes':len(a.stdout),'extractExit':restored.returncode,'extractStderr':restored.stderr.decode(),'sourceSha256':sha(a.stdout),'targetSha256':sha(b.stdout),'rearchiveStable':a.stdout==b.stdout,'newNodeInode':os.stat(dst+'/usr/bin/node').st_ino!=old_node,'newTarInode':os.stat(dst+'/usr/bin/tar').st_ino!=old_tar,'nodeExit':worker.returncode,'nodeStderr':noderr.decode(),'nodeAfterReplacement':json.loads(nodeout),'outsideSentinelUnchanged':open(work+'/outside/sentinel','rb').read()==b'OUTSIDE','outsideHasNoChild':not os.path.exists(work+'/outside/child'),'absentTargetDeleted':not os.path.lexists(dst+'/deleted-base'),'noDevNullInsideChroot':not os.path.exists(dst+'/dev/null'),'inventoryEqual':inventory(src)==inventory(dst)}
        finally:
            if worker.poll() is None:worker.kill();worker.wait()
    case('chrootRuntimeReplacement',chroot_runtime)
    inc=report['modes']['incremental'];edges=report['edgeCases'];rt=edges['chrootRuntimeReplacement']
    report['checks']={
        'completeSyntheticInventoryAndHash':inc['inventoryEqual'] and inc['rearchiveStable'] and inc['repeatStable'],
        'ordinaryArchiveLeavesAbsences':not report['modes']['ordinary']['inventoryEqual'],
        'listedDevNullCreateRejected':report['modes']['listedNull']['createExit']==2,
        'defaultTypeSwapsAllPass':all(x['equal'] and x['exit']==0 for x in edges['typeSwaps'] if not x['flags']),
        'unlinkFirstAndRecursiveRejectDot':all(x['exit']==2 for x in edges['typeSwaps'] if x['flags']),
        'defaultProtectsExistingInode':all(edges['inodeSafety'][0][k] for k in ['newInode','oldMappedBytesUnchanged','outsideHardlinkUnchanged']),
        'overwriteDemonstrablyUnsafe':not edges['inodeSafety'][2]['oldMappedBytesUnchanged'] and not edges['inodeSafety'][2]['outsideHardlinkUnchanged'],
        'directoryXattrHoleReproduced':not edges['staleDirectoryXattr']['equal'],
        'directoryXattrPreclearRepairsFixture':edges['clearDirectoryXattrs']['inventoryEqual'] and edges['clearDirectoryXattrs']['rearchiveStable'],
        'socketOmissionDetected':edges['socketOmission']['createExit']==0 and not edges['socketOmission']['restoredSocket'] and bool(edges['socketOmission']['createStderr']),
        'chrootSelfReplacementPasses':rt.get('inventoryEqual',False) and rt.get('rearchiveStable',False) and rt.get('newNodeInode',False) and rt.get('newTarInode',False) and rt.get('nodeExit')==0 and rt.get('outsideSentinelUnchanged',False) and rt.get('outsideHasNoChild',False),
    }
    assert all(report['checks'].values()),report['checks']
    report['fixturePassed']=True
except Exception:
    report['fatalError']=traceback.format_exc()
finally:
    print(json.dumps(report,sort_keys=True));shutil.rmtree(BASE)
    if not report.get('fixturePassed'):raise SystemExit(1)
