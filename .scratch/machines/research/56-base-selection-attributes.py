# Private inventory returned only to the guest worker. Never opens non-file/non-directory objects.
import os,sys,stat,json,hashlib,fcntl,struct,ctypes,base64,socket
VIEW,TOKEN=sys.argv[1:]
assert sys.byteorder=='little' and os.uname().machine=='aarch64'
GET,GETX=0x80086601,0x801c581f
libc=ctypes.CDLL(None,use_errno=True)
libc.statx.argtypes=[ctypes.c_int,ctypes.c_char_p,ctypes.c_int,ctypes.c_uint,ctypes.c_void_p]
libc.statx.restype=ctypes.c_int
opens={};queries={};rows=[]
def err(e):return {'errno':e.errno}
def query(p):
    s=os.lstat(p)
    kind='file' if stat.S_ISREG(s.st_mode) else 'directory' if stat.S_ISDIR(s.st_mode) else 'symlink' if stat.S_ISLNK(s.st_mode) else 'fifo' if stat.S_ISFIFO(s.st_mode) else 'char' if stat.S_ISCHR(s.st_mode) else 'block' if stat.S_ISBLK(s.st_mode) else 'socket' if stat.S_ISSOCK(s.st_mode) else 'other'
    r={'type':kind,'mode':s.st_mode,'uid':s.st_uid,'gid':s.st_gid,'size':str(s.st_size),'nlink':str(s.st_nlink),'ino':str(s.st_ino),'dev':str(s.st_dev),'rdev':str(s.st_rdev),'mtimeNs':str(s.st_mtime_ns),'atimeNs':str(s.st_atime_ns),'ctimeNs':str(s.st_ctime_ns)}
    raw=ctypes.create_string_buffer(256)
    if libc.statx(-100,os.fsencode(p),0x100|0x800,0x7ff,raw):r['statx']=err(OSError(ctypes.get_errno(),''))
    else:r['statx']={'attributes':str(struct.unpack_from('<Q',raw.raw,8)[0]),'mask':str(struct.unpack_from('<Q',raw.raw,56)[0])}
    try:r['xattrs']={n:{'bytes':len(v),'sha256':hashlib.sha256(v).hexdigest()} for n in sorted(os.listxattr(p,follow_symlinks=False)) for v in [os.getxattr(p,n,follow_symlinks=False)]}
    except OSError as e:r['xattrs']=err(e)
    if kind not in ['file','directory']:
        r['getflags']={'skipped':'no data descriptor opened'};r['fsgetxattr']={'skipped':'no data descriptor opened'};return r
    try:fd=os.open(p,os.O_RDONLY|os.O_NOATIME|os.O_NOFOLLOW|os.O_NONBLOCK)
    except OSError as e:r['open']=err(e);return r
    opens[kind]=opens.get(kind,0)+1
    try:
        for name,request,size in [('getflags',GET,4),('fsgetxattr',GETX,28)]:
            queries[kind]=queries.get(kind,0)+1
            try:
                b=bytearray(size);fcntl.ioctl(fd,request,b,True)
                r[name]={'flags':struct.unpack('<I',b)[0]} if name=='getflags' else dict(zip(['xflags','extsize','nextents','projid','cowextsize'],struct.unpack('<5I8x',b)))
            except OSError as e:r[name]=err(e)
    finally:os.close(fd)
    return r
def walk(p,rel):
    r=query(p);rows.append([base64.b64encode(rel).decode(),r])
    if r['type']=='directory':
        fd=os.open(p,os.O_RDONLY|os.O_DIRECTORY|os.O_NOATIME|os.O_NOFOLLOW)
        try:names=sorted(os.fsencode(n) for n in os.listdir(fd))
        finally:os.close(fd)
        for n in names:walk(p+b'/'+n,rel+b'/'+n)
walk(os.fsencode(VIEW),b'.')
# A socket probe is outside every captured persistent view, under the owned control tmpfs.
probe=os.path.dirname(VIEW)+'/socket-'+TOKEN
sock=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM)
try:
    sock.bind(probe);special=query(probe)
finally:sock.close();os.unlink(probe)
print(json.dumps({'entries':rows,'socketProbe':special,'descriptorOpens':opens,'ioctlCalls':queries},separators=(',',':')))
