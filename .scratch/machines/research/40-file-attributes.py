# Synthetic guest-only attribute probe. Full inventory reads metadata, not file contents.
import os,sys,stat,json,hashlib,subprocess,fcntl,struct,ctypes,io,tarfile,shutil
VIEW,UUID=sys.argv[1:]
assert sys.byteorder=='little' and os.uname().machine=='aarch64'
GETFLAGS,SETFLAGS,GETX,SETX=0x80086601,0x40086602,0x801c581f,0x401c5820
libc=ctypes.CDLL(None,use_errno=True)
libc.statx.argtypes=[ctypes.c_int,ctypes.c_char_p,ctypes.c_int,ctypes.c_uint,ctypes.c_void_p]
libc.statx.restype=ctypes.c_int
ENV={'PATH':'/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin','LC_ALL':'C','TZ':'UTC'}
FLAGS=['--incremental','--sort=name','--format=pax','--pax-option=exthdr.name=%d/PaxHeaders/%f,delete=atime,delete=ctime','--numeric-owner','--acls','--xattrs','--xattrs-include=*','--sparse','--sparse-version=0.0','--atime-preserve=system']
ATTRS={'compressed':0x4,'immutable':0x10,'append':0x20,'nodump':0x40,'encrypted':0x800,'automount':0x1000,'mount_root':0x2000,'verity':0x100000,'dax':0x200000,'write_atomic':0x400000}
def err(e):return {'errno':e.errno,'error':e.strerror}
def sx(p):
    b=ctypes.create_string_buffer(256)
    if libc.statx(-100,os.fsencode(p),0x100|0x800,0x7ff,b):return err(OSError(ctypes.get_errno(),os.strerror(ctypes.get_errno())))
    attrs,mask=struct.unpack_from('<Q',b.raw,8)[0],struct.unpack_from('<Q',b.raw,56)[0]
    return {'attributes':attrs,'attributesMask':mask,'bits':{n:bool(attrs&bit) if mask&bit else None for n,bit in ATTRS.items()}}
def query(p):
    s=os.lstat(p);r={'type':'file' if stat.S_ISREG(s.st_mode) else 'directory' if stat.S_ISDIR(s.st_mode) else 'symlink' if stat.S_ISLNK(s.st_mode) else 'other','statx':sx(p)}
    if r['type'] not in ['file','directory']:return r
    try:fd=os.open(p,os.O_RDONLY|os.O_NOATIME|os.O_NOFOLLOW|os.O_NONBLOCK)
    except OSError as e:r['open']=err(e);return r
    try:
        for key,request,size in [('getflags',GETFLAGS,4),('fsgetxattr',GETX,28)]:
            try:
                b=bytearray(size);fcntl.ioctl(fd,request,b,True)
                r[key]={'flags':struct.unpack('<I',b)[0]} if key=='getflags' else dict(zip(['xflags','extsize','nextents','projid','cowextsize'],struct.unpack('<5I8x',b)))
            except OSError as e:r[key]=err(e)
    finally:os.close(fd)
    return r
def inventory(root):
    count=0;types={};apis={k:{} for k in ['getflags','fsgetxattr','statx']};examples={k:{} for k in apis};errors=[];h=hashlib.sha256()
    def visit(p,relative):
        nonlocal count
        try:
            r=query(p);count+=1;types[r['type']]=types.get(r['type'],0)+1
            h.update(json.dumps([relative,r],sort_keys=True,separators=(',',':')).encode())
            if 'open' in r:errors.append({'path':relative,**r['open']})
            for api in apis:
                if api not in r:continue
                key=json.dumps(r[api],sort_keys=True,separators=(',',':'));apis[api][key]=apis[api].get(key,0)+1
                if key not in examples[api]:examples[api][key]=relative
            if r['type']=='directory':
                for name in sorted(os.listdir(p)):visit(p+'/'+name,relative.rstrip('/')+'/'+name)
        except OSError as e:errors.append({'path':relative,**err(e)})
    visit(root,'/')
    return {'count':count,'types':types,'apis':{api:[{'value':json.loads(k),'count':n,'example':examples[api][k]} for k,n in values.items()] for api,values in apis.items()},'errors':errors,'sha256':h.hexdigest()}
def setting(p,api,before,bit,enabled):
    fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
    try:
        if api=='getflags':
            value=before['flags']|bit if enabled else before['flags'];b=struct.pack('<I',value);fcntl.ioctl(fd,SETFLAGS,b)
        else:
            value=before['xflags']|bit if enabled else before['xflags'];b=struct.pack('<5I8x',value,before['extsize'],before['nextents'],before['projid'],before['cowextsize']);fcntl.ioctl(fd,SETX,b)
        return {'ok':True}
    except OSError as e:return err(e)
    finally:os.close(fd)
def create_tar(root):
    p=subprocess.run(['tar',*FLAGS,'-C',root,'-cf','-','.'],stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=ENV,timeout=10)
    assert len(p.stdout)<=1024**2
    members=[]
    if p.returncode==0:
        with tarfile.open(fileobj=io.BytesIO(p.stdout),mode='r:') as tf:
            members=[{'name':m.name,'type':m.type.decode(),'paxKeys':sorted(m.pax_headers)} for m in tf]
    return p.stdout,{'exitCode':p.returncode,'stderr':p.stderr.decode(),'bytes':len(p.stdout),'sha256':hashlib.sha256(p.stdout).hexdigest(),'members':members}
def extract_tar(data,root):
    p=subprocess.run(['tar','--incremental','--numeric-owner','--acls','--xattrs','--xattrs-include=*','--delay-directory-restore','-C',root,'-xpf','-'],input=data,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=ENV,timeout=10)
    return {'exitCode':p.returncode,'stderr':p.stderr.decode()}
def make_item(base,kind,text):
    os.mkdir(base);p=base+'/item'
    if kind=='directory':os.mkdir(p);open(p+'/child','w').write(text)
    else:open(p,'w').write(text)
    return p
def trial(root,api,name,kind,gbit,xbit):
    base=root+'/'+api+'-'+name+'-'+kind;os.mkdir(base)
    src,clean,blocked=base+'/source',base+'/clean',base+'/blocked'
    p=make_item(src,kind,'source synthetic payload\n');os.mkdir(clean)
    target=make_item(blocked,kind,'target synthetic payload\n')
    before=query(p);target_before=query(target);bit=gbit if api=='getflags' else xbit
    result={'api':api,'flag':name,'kind':kind,'before':before};source_changed=target_changed=False
    try:
        if api not in before or 'errno' in before[api]:result['skip']='source query unavailable';return result
        baseline_data,result['baselineArchive']=create_tar(src)
        result['set']=setting(p,api,before[api],bit,True);source_changed=True
        result['afterSet']=query(p)
        if not result['set'].get('ok'):return result
        result['readBackHasRequestedBit']=bool(result['afterSet'][api].get('flags' if api=='getflags' else 'xflags',0)&bit)
        data,result['archive']=create_tar(src);result['archiveEqualWithFlag']=data==baseline_data
        if result['archive']['exitCode']==0:
            result['cleanExtract']=extract_tar(data,clean)
            if os.path.lexists(clean+'/item'):result['cleanRestored']=query(clean+'/item')
            result['targetSet']=setting(target,api,target_before[api],bit,True);target_changed=True
            result['targetBeforeExtract']=query(target)
            if result['targetSet'].get('ok'):
                result['protectedExtract']=extract_tar(data,blocked)
                if os.path.lexists(target):result['targetAfterExtract']=query(target)
        return result
    finally:
        if target_changed and os.path.lexists(target):result['targetRevert']=setting(target,api,target_before[api],bit,False);result['targetAfterRevert']=query(target)
        if source_changed:result['sourceRevert']=setting(p,api,before[api],bit,False);result['sourceAfterRevert']=query(p)
        # A failed revert is a hard failure; cleanup must never recursively delete flagged data blindly.
        for key in ['targetRevert','sourceRevert']:
            if key in result:assert result[key].get('ok'),json.dumps(result)
        for q,prior in [(p,before),(target,target_before)]:
            if os.path.lexists(q):
                now=query(q)
                for a in ['getflags','fsgetxattr']:
                    if a in prior and 'errno' not in prior[a]:assert now[a]==prior[a],json.dumps({'path':q,'before':prior,'after':now})
        shutil.rmtree(base)

roots={'upper':VIEW+'/opt/blobot-attributes40-'+UUID,'home':'/home/agent/blobot-attributes40-'+UUID,'docker':'/var/lib/docker/blobot-attributes40-'+UUID}
report={'interfaces':{'getflags':hex(GETFLAGS),'setflags':hex(SETFLAGS),'fsgetxattr':hex(GETX),'fssetxattr':hex(SETX)},'samples':{},'inventories':{},'trials':[]}
try:
    for root in roots.values():os.mkdir(root);open(root+'/sample','w').write('synthetic attribute sample\n')
    samples={'lowerFile':VIEW+'/.rock/metadata.yaml','lowerDirectory':VIEW+'/.rock','upperFile':roots['upper']+'/sample','upperDirectory':roots['upper'],'homeFile':roots['home']+'/sample','homeDirectory':roots['home'],'dockerFile':roots['docker']+'/sample','dockerDirectory':roots['docker']}
    report['samples']={name:{'path':p.removeprefix(VIEW),**query(p)} for name,p in samples.items()}
    assert report['samples']['lowerFile']['type']=='file' and report['samples']['lowerDirectory']['type']=='directory'
    for name,path in [('root',VIEW),('home','/home/agent'),('docker','/var/lib/docker')]:
        report['inventories'][name]=inventory(path);assert not report['inventories'][name]['errors']
    for area,root in roots.items():
        for api in ['getflags','fsgetxattr']:
            for name,gbit,xbit,kinds in [('immutable',0x10,0x8,['file','directory']),('append',0x20,0x10,['file','directory']),('nodump',0x40,0x80,['file','directory']),('projinherit',0x20000000,0x200,['directory'])]:
                for kind in kinds:report['trials'].append({'area':area,**trial(root,api,name,kind,gbit,xbit)})
    report['completed']=True
finally:
    for root in roots.values():
        if os.path.exists(root):shutil.rmtree(root)
print(json.dumps(report,separators=(',',':')))
