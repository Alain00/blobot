# Mutations are limited to an owned marker tree and three approved public image samples.
import os,sys,stat,fcntl,struct
UUID,ROLE,ACTION=sys.argv[1:]
BASE='/opt/blobot-compare56-'+UUID
GET,SET=0x80086601,0x40086602
BITS={'immutable':0x10,'nodump':0x40,'append':0x20}
def flags(p,value=None):
    fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
    try:
        if value is not None:fcntl.ioctl(fd,SET,struct.pack('<I',value))
        b=bytearray(4);fcntl.ioctl(fd,GET,b,True);return struct.unpack('<I',b)[0]
    finally:os.close(fd)
if ACTION=='clear':
    if ROLE=='source' and os.path.isdir(BASE):
        for name,bit in BITS.items():
            for suffix in ['-file','-dir']:
                p=BASE+'/'+name+suffix
                if os.path.lexists(p):
                    current=flags(p);flags(p,current&~bit);assert not flags(p)&bit
    sys.exit(0)
assert ACTION=='seed' and ROLE in ['source','target']
os.mkdir(BASE)
for name in BITS:
    with open(BASE+'/'+name+'-file','wb') as f:f.write(b'identical synthetic flag marker\n')
    os.mkdir(BASE+'/'+name+'-dir')
    with open(BASE+'/'+name+'-dir/child','wb') as f:f.write(b'identical synthetic child\n')
os.mkfifo(BASE+'/fifo',0o600)
os.symlink('missing-synthetic-target',BASE+'/symlink')
os.mknod(BASE+'/char-device',stat.S_IFCHR|0o600,os.makedev(1,3))
os.mknod(BASE+'/block-device',stat.S_IFBLK|0o600,os.makedev(240,1))
for current,dirs,files in os.walk(BASE,followlinks=False):
    for name in files+dirs:os.utime(current+'/'+name,ns=(1700000000123456789,1700000000123456789),follow_symlinks=False)
    os.utime(current,ns=(1700000000123456789,1700000000123456789),follow_symlinks=False)
if ROLE=='source':
    with open('/etc/issue','ab') as f:f.write(b'\nsynthetic-source56\n')
    os.unlink('/etc/issue.net')
    fd=os.open('/etc/debian_version',os.O_RDWR|os.O_NOFOLLOW);os.close(fd)
    for name,bit in BITS.items():
        for suffix in ['-file','-dir']:
            p=BASE+'/'+name+suffix;flags(p,flags(p)|bit);assert flags(p)&bit
