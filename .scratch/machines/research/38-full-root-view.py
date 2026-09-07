# Runs only inside the isolated guest root view. Never emits file/archive bytes.
import os, sys, stat, json, hashlib, subprocess, threading, time, fcntl, array, errno
ROOT='/'
FLAGS=['--incremental','--sort=name','--format=pax','--pax-option=exthdr.name=%d/PaxHeaders/%f,delete=atime,delete=ctime','--numeric-owner','--acls','--xattrs','--xattrs-include=*','--sparse','--sparse-version=0.0','--atime-preserve=system','-C','/','-cf','-','.']
ENV={'PATH':'/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin','LC_ALL':'C','TZ':'UTC','HOME':'/root'}
def digest(value): return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def scan():
    records={}; errors=[]; types={}; attrs={}; inode_flags={}; unavailable_flags={}; flag_examples=[]; links={}; sockets=[]; total=0; special=[]; sparse=[]
    def flags_for(fd,p,r):
        try:
            flags=array.array('L',[0]); fcntl.ioctl(fd,0x80086601,flags,True); r['inodeFlags']=flags[0]; inode_flags[str(flags[0])]=inode_flags.get(str(flags[0]),0)+1
        except OSError as e:
            r['inodeFlagsUnavailable']=e.errno; unavailable_flags[str(e.errno)]=unavailable_flags.get(str(e.errno),0)+1
            if len(flag_examples)<10: flag_examples.append({'path':p,'errno':e.errno,'reason':e.strerror})
    def visit(p):
        nonlocal total
        try:
            s=os.lstat(p); kind='file' if stat.S_ISREG(s.st_mode) else 'directory' if stat.S_ISDIR(s.st_mode) else 'symlink' if stat.S_ISLNK(s.st_mode) else 'socket' if stat.S_ISSOCK(s.st_mode) else 'fifo' if stat.S_ISFIFO(s.st_mode) else 'char' if stat.S_ISCHR(s.st_mode) else 'block' if stat.S_ISBLK(s.st_mode) else 'other'
            types[kind]=types.get(kind,0)+1
            r={'type':kind,'mode':s.st_mode,'uid':s.st_uid,'gid':s.st_gid,'mtimeNs':str(s.st_mtime_ns)}
            xattrs={}
            for key in sorted(os.listxattr(p,follow_symlinks=False)):
                xattrs[key]=hashlib.sha256(os.getxattr(p,key,follow_symlinks=False)).hexdigest(); attrs[key]=attrs.get(key,0)+1
            r['xattrs']=xattrs
            if kind=='file':
                fd=os.open(p,os.O_RDONLY|os.O_NOATIME); h=hashlib.sha256()
                try:
                    while True:
                        b=os.read(fd,65536)
                        if not b: break
                        h.update(b)
                    flags_for(fd,p,r)
                finally: os.close(fd)
                r.update(size=s.st_size,sha256=h.hexdigest()); total+=s.st_size
                if s.st_nlink>1: links.setdefault((s.st_dev,s.st_ino),[]).append(p)
                if s.st_blocks*512<s.st_size: sparse.append({'path':p,'size':s.st_size,'blocks':s.st_blocks})
            elif kind=='directory':
                fd=os.open(p,os.O_RDONLY|os.O_DIRECTORY|os.O_NOATIME)
                try:
                    flags_for(fd,p,r)
                finally: os.close(fd)
                names=sorted(os.listdir(p)); r['childrenHash']=digest(names)
                for name in names: visit((p.rstrip('/')+'/'+name))
            elif kind=='symlink': r.update(size=s.st_size,targetHash=hashlib.sha256(os.fsencode(os.readlink(p))).hexdigest(),absolute=os.readlink(p).startswith('/'))
            else:
                r['rdev']=s.st_rdev; special.append({'path':p,**r})
                if kind=='socket': sockets.append(p)
            records[p]=r
        except OSError as e: errors.append({'path':p,'errno':e.errno,'reason':e.strerror})
    visit('/')
    groups=[]
    for names in links.values():
        names=sorted(names); group=digest(names); groups.append(names)
        for p in names: records[p]['hardlinkGroup']=group
    top={}
    for p,r in records.items(): top.setdefault('/'+p.strip('/').split('/')[0] if p!='/' else '/',{})[p]=r
    return records,{'count':len(records),'types':types,'regularLogicalBytes':total,'xattrNamespaces':attrs,'inodeFlagCounts':inode_flags,'inodeFlagsUnavailable':unavailable_flags,'inodeFlagsUnavailableExamples':flag_examples,'sockets':sockets,'special':special,'sparse':sparse,'hardlinkGroups':len(groups),'errors':errors,'sha256':digest(records),'topLevelHashes':{p:digest(v) for p,v in top.items()}}
def archive():
    start=time.monotonic(); p=subprocess.Popen(['tar',*FLAGS],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=ENV);p.stdin.close()
    warning=[]; warning_bytes=[0]
    def collect():
        while True:
            b=p.stderr.read(65536)
            if not b:break
            warning_bytes[0]+=len(b)
            if sum(map(len,warning))<131072:warning.append(b)
    t=threading.Thread(target=collect);t.start(); h=hashlib.sha256();n=0
    try:
        while True:
            b=p.stdout.read(65536)
            if not b:break
            n+=len(b)
            if n>4*1024**3: raise RuntimeError('Root archive exceeded 4 GiB bound')
            h.update(b)
        code=p.wait(timeout=60);t.join()
        return {'sha256':h.hexdigest(),'bytes':n,'exitCode':code,'stderr':b''.join(warning).decode(errors='replace'),'stderrBytes':warning_bytes[0],'ms':(time.monotonic()-start)*1000}
    finally:
        if p.poll() is None:p.kill();p.wait()
def differences(a,b):
    result=[]
    for p in sorted(set(a)|set(b)):
        if a.get(p)!=b.get(p):result.append({'path':p,'before':a.get(p),'after':b.get(p)})
    return result
before,summary=scan(); first=archive(); second=archive(); after,after_summary=scan()
print(json.dumps({'inventory':before,'summary':summary,'afterSummary':after_summary,'archives':[first,second],'archiveStable':first['sha256']==second['sha256'] and first['bytes']==second['bytes'],'inventoryStable':before==after,'duringArchiveChanges':differences(before,after),'tarVersion':subprocess.check_output(['tar','--version'],env=ENV,text=True).splitlines()[0],'tarPackage':subprocess.check_output(['dpkg-query','-W','-f=${Version}','tar'],env=ENV,text=True)},separators=(',',':')))
