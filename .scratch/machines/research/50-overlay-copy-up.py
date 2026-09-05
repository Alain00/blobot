# Runs only inside a disposable sbx fixture and its private nonrecursive root view.
import os, sys, stat, json, hashlib, fcntl, struct, ctypes, errno

VIEW, UUID = sys.argv[1:]
assert sys.byteorder == 'little' and os.uname().machine == 'aarch64'
GETFLAGS, SETFLAGS, GETX = 0x80086601, 0x40086602, 0x801c581f
libc = ctypes.CDLL(None, use_errno=True)
libc.statx.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_uint, ctypes.c_void_p]
libc.statx.restype = ctypes.c_int

def failure(e):
    return {'errno': e.errno, 'error': e.strerror}

def attempt(fn):
    try:
        fn()
        return {'ok': True}
    except OSError as e:
        return failure(e)

def read_file(p):
    fd = os.open(p, os.O_RDONLY | os.O_NOATIME | os.O_NOFOLLOW)
    try:
        s = os.fstat(fd)
        assert stat.S_ISREG(s.st_mode) and s.st_size < 1024 * 1024
        return os.read(fd, s.st_size + 1)
    finally:
        os.close(fd)

def query(p):
    try:
        s = os.lstat(p)
    except OSError as e:
        return failure(e)
    r = {'mode': s.st_mode, 'uid': s.st_uid, 'gid': s.st_gid, 'size': s.st_size,
         'mtimeNs': s.st_mtime_ns, 'atimeNs': s.st_atime_ns, 'ctimeNs': s.st_ctime_ns,
         'ino': s.st_ino, 'dev': s.st_dev, 'nlink': s.st_nlink, 'blocks': s.st_blocks}
    b = ctypes.create_string_buffer(256)
    assert libc.statx(-100, os.fsencode(p), 0x100 | 0x800, 0x7ff, b) == 0
    r['statx'] = {'attributes': struct.unpack_from('<Q', b.raw, 8)[0],
                  'attributesMask': struct.unpack_from('<Q', b.raw, 56)[0]}
    assert stat.S_ISREG(s.st_mode) or stat.S_ISDIR(s.st_mode)
    fd = os.open(p, os.O_RDONLY | os.O_NOATIME | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        for name, request, size in [('getflags', GETFLAGS, 4), ('fsgetxattr', GETX, 28)]:
            try:
                raw = bytearray(size)
                fcntl.ioctl(fd, request, raw, True)
                r[name] = {'flags': struct.unpack('<I', raw)[0]} if name == 'getflags' else dict(zip(
                    ['xflags', 'extsize', 'nextents', 'projid', 'cowextsize'], struct.unpack('<5I8x', raw)))
            except OSError as e:
                r[name] = failure(e)
    finally:
        os.close(fd)
    r['xattrs'] = {n: {'bytes': len(v), 'sha256': hashlib.sha256(v).hexdigest()}
                   for n in sorted(os.listxattr(p, follow_symlinks=False))
                   for v in [os.getxattr(p, n, follow_symlinks=False)]}
    if stat.S_ISREG(s.st_mode):
        r['sha256'] = hashlib.sha256(read_file(p)).hexdigest()
    return r

def open_write_only(p):
    fd = os.open(p, os.O_RDWR | os.O_NOFOLLOW)
    os.close(fd)

def append(p):
    fd = os.open(p, os.O_WRONLY | os.O_APPEND | os.O_NOFOLLOW)
    try:
        marker = ('\nsynthetic-copy-up-50-' + UUID + '\n').encode()
        assert os.write(fd, marker) == len(marker)
        os.fsync(fd)
    finally:
        os.close(fd)

def set_flags(p, flags):
    fd = os.open(p, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        fcntl.ioctl(fd, SETFLAGS, struct.pack('<I', flags))
    finally:
        os.close(fd)

def restore_bytes(p, data, old):
    fd = os.open(p, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, old['mode'] & 0o7777)
    try:
        assert os.write(fd, data) == len(data)
        os.fchmod(fd, old['mode'] & 0o7777)
        os.fchown(fd, old['uid'], old['gid'])
        os.fsync(fd)
    finally:
        os.close(fd)
    os.utime(p, ns=(old['atimeNs'], old['mtimeNs']), follow_symlinks=False)

paths = {'write': '/.rock/metadata.yaml', 'parent': '/.rock', 'chmod': '/etc/issue',
         'delete': '/etc/issue.net', 'directory': '/usr/share/doc', 'untouched': '/etc/debian_version'}
p = {k: VIEW + v for k, v in paths.items()}
report = {'paths': paths, 'uid': os.geteuid(), 'gid': os.getegid(), 'before': {}, 'operations': {}, 'checks': {}}
report['before'] = {k: query(v) for k, v in p.items()}
for k, v in report['before'].items():
    assert v['getflags'].get('errno') == errno.ENOTTY, (k, v)
    assert v['fsgetxattr'].get('errno') == errno.ENOTTY, (k, v)
    assert v['statx']['attributes'] & 0x10 and v['statx']['attributesMask'] & 0x10, (k, v)
original = {k: read_file(p[k]) for k in ['write', 'chmod', 'delete', 'untouched']}
try:
    report['operations']['openForWriteWithoutWriting'] = attempt(lambda: open_write_only(p['write']))
    report['afterOpenWithoutWrite'] = query(p['write'])
    report['parentAfterChildOpen'] = query(p['parent'])
    report['operations']['appendBeforeExplicitImmutable'] = attempt(lambda: append(p['write']))
    report['afterAppend'] = query(p['write'])
    report['checks']['appendActuallyChangedBytes'] = read_file(p['write']) != original['write']
    restore_bytes(p['write'], original['write'], report['before']['write'])
    report['afterContentAndTimesRestored'] = query(p['write'])

    before_flag = query(p['write'])['getflags']['flags']
    assert not before_flag & 0x10
    try:
        report['operations']['setExplicitImmutable'] = attempt(lambda: set_flags(p['write'], before_flag | 0x10))
        report['withExplicitImmutable'] = query(p['write'])
        if report['operations']['setExplicitImmutable'].get('ok'):
            report['operations']['appendWithExplicitImmutable'] = attempt(lambda: append(p['write']))
            report['operations']['unlinkWithExplicitImmutable'] = attempt(lambda: os.unlink(p['write']))
            report['withExplicitImmutableAfterAttempts'] = query(p['write'])
    finally:
        report['operations']['clearExplicitImmutable'] = attempt(lambda: set_flags(p['write'], before_flag))
        assert report['operations']['clearExplicitImmutable'].get('ok'), report
    report['afterImmutableReverted'] = query(p['write'])

    report['operations']['sameModeChmodFile'] = attempt(lambda: os.chmod(p['chmod'], report['before']['chmod']['mode'] & 0o7777))
    report['afterSameModeChmodFile'] = query(p['chmod'])
    report['operations']['sameModeChmodDirectory'] = attempt(lambda: os.chmod(p['directory'], report['before']['directory']['mode'] & 0o7777))
    report['afterSameModeChmodDirectory'] = query(p['directory'])

    report['operations']['unlinkBaseFile'] = attempt(lambda: os.unlink(p['delete']))
    report['afterUnlink'] = query(p['delete'])
    restore_bytes(p['delete'], original['delete'], report['before']['delete'])
    report['afterRecreateIdenticalBytesAndTimes'] = query(p['delete'])
    report['untouchedAfter'] = query(p['untouched'])
    report['checks']['untouchedExactSnapshot'] = report['untouchedAfter'] == report['before']['untouched']
    ordinary = ['mode', 'uid', 'gid', 'size', 'mtimeNs', 'atimeNs', 'sha256', 'xattrs', 'nlink']
    report['checks']['openWithoutWritePreservesComparedMetadata'] = all(report['before']['write'][k] == report['afterOpenWithoutWrite'][k] for k in ordinary)
    report['checks']['restoredBytesAndComparedMetadata'] = all(report['before']['write'][k] == report['afterContentAndTimesRestored'][k] for k in ordinary)
    report['checks']['recreatedBytesAndComparedMetadata'] = all(report['before']['delete'][k] == report['afterRecreateIdenticalBytesAndTimes'][k] for k in ordinary)
    report['completed'] = True
finally:
    # These are public-image samples in this owned disposable guest, never host paths.
    for k in ['write', 'chmod', 'delete']:
        restore_bytes(p[k], original[k], report['before'][k])
    report['cleanup'] = {'sampleContentRestored': all(read_file(p[k]) == original[k] for k in ['write', 'chmod', 'delete']),
                         'explicitImmutableAbsent': not query(p['write'])['getflags'].get('flags', 0) & 0x10,
                         'baseBackingNotRestored': True}
print(json.dumps(report, separators=(',', ':')))
