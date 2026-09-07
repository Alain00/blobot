# Guest-only synthetic trees. No extraction addresses the actual root or host mounts.
import os, sys, stat, json, hashlib, fcntl, struct, subprocess, io, tarfile, shutil
VIEW, UUID = sys.argv[1:]
assert sys.byteorder == 'little' and os.uname().machine == 'aarch64'
BASE = VIEW + '/opt/blobot-selective52-' + UUID
GETFLAGS, SETFLAGS = 0x80086601, 0x40086602
ENV = {'PATH': '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', 'LC_ALL': 'C', 'TZ': 'UTC'}
ATTR = ['--numeric-owner', '--acls', '--xattrs', '--xattrs-include=*']
CREATE = ['--incremental', '--sort=name', '--format=pax', '--pax-option=exthdr.name=%d/PaxHeaders/%f,delete=atime,delete=ctime', *ATTR, '--sparse', '--sparse-version=0.0', '--atime-preserve=system']
EXTRACT = ['--incremental', *ATTR, '--delay-directory-restore', '--no-recursion', '--null', '--verbatim-files-from', '--no-wildcards', '--anchored', '--no-unquote']
ODD = ['-dash', ' leading\ttrailing ', 'line\nbreak', r'back\slash', 'literal[*]?', 'café']
STAMP = 1700000000123456789
report = {'uuid': UUID, 'cases': {}, 'createOptions': CREATE, 'extractOptions': EXTRACT, 'largeIntegersEncodedAsStrings': True}

def read_file(p):
    fd = os.open(p, os.O_RDONLY | os.O_NOFOLLOW | os.O_NOATIME)
    try:
        size = os.fstat(fd).st_size
        assert size < 1024 * 1024
        return os.read(fd, size + 1)
    finally: os.close(fd)

def flags(p, value=None):
    fd = os.open(p, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_NOATIME)
    try:
        if value is not None: fcntl.ioctl(fd, SETFLAGS, struct.pack('<I', value))
        b = bytearray(4); fcntl.ioctl(fd, GETFLAGS, b, True)
        return struct.unpack('<I', b)[0]
    finally: os.close(fd)

def inventory(root):
    result = {}
    def visit(p, rel):
        s = os.lstat(p)
        r = {'type': 'directory' if stat.S_ISDIR(s.st_mode) else 'file' if stat.S_ISREG(s.st_mode) else 'symlink',
             'mode': s.st_mode, 'uid': s.st_uid, 'gid': s.st_gid, 'size': s.st_size, 'nlink': s.st_nlink,
             'ino': str(s.st_ino), 'dev': str(s.st_dev), 'mtimeNs': str(s.st_mtime_ns), 'ctimeNs': str(s.st_ctime_ns),
             'xattrs': {n: {'bytes': len(v), 'sha256': hashlib.sha256(v).hexdigest()}
                        for n in sorted(os.listxattr(p, follow_symlinks=False))
                        for v in [os.getxattr(p, n, follow_symlinks=False)]}}
        if r['type'] in ['directory', 'file']: r['flags'] = flags(p)
        if r['type'] == 'file': r['sha256'] = hashlib.sha256(read_file(p)).hexdigest()
        if r['type'] == 'symlink': r['link'] = os.readlink(p)
        result[rel] = r
        if r['type'] == 'directory':
            fd = os.open(p, os.O_RDONLY | os.O_DIRECTORY | os.O_NOATIME | os.O_NOFOLLOW)
            try: names = sorted(os.listdir(fd))
            finally: os.close(fd)
            for n in names: visit(p + '/' + n, rel.rstrip('/') + '/' + n)
    visit(root, '.')
    return result

def file(p, data):
    with open(p, 'wb') as f: f.write(data)

def seed(root, source, outside):
    os.mkdir(root)
    for d in ['branch', 'keep-dir', 'pristine', 'change-dir', 'swaps']: os.mkdir(root + '/' + d)
    for d in ['keep-dir', 'pristine']: file(root + '/' + d + '/keep', b'unchanged synthetic bytes\n')
    file(root + '/branch/unchanged', b'stable branch child\n')
    file(root + '/branch/changed', b'source changed\n' if source else b'target old\n')
    for n in ODD: file(root + '/branch/' + n, b'selected source\n' if source else b'selected target old\n')
    # Intentionally omitted changes prove what selection does, rather than assuming equality.
    file(root + '/keep-dir/omitted-change', b'source omitted\n' if source else b'target omitted\n')
    file(root + '/change-dir/child', b'source metadata child\n' if source else b'target old child\n')
    if source:
        for n in ['file-from-dir', 'file-from-link']: file(root + '/swaps/' + n, b'restored file\n')
        for n in ['dir-from-file', 'dir-from-link']:
            os.mkdir(root + '/swaps/' + n); file(root + '/swaps/' + n + '/child', b'restored child\n')
        for n in ['link-from-file', 'link-from-dir']: os.symlink('dangling-synthetic-target', root + '/swaps/' + n)
    else:
        for n in ['file-from-dir', 'link-from-dir']:
            os.mkdir(root + '/swaps/' + n); file(root + '/swaps/' + n + '/old-child', b'old child\n')
        for n in ['dir-from-file', 'link-from-file']: file(root + '/swaps/' + n, b'old file\n')
        os.symlink(outside + '/sentinel', root + '/swaps/file-from-link')
        os.symlink(outside, root + '/swaps/dir-from-link')
        file(root + '/target-only-root', b'delete root\n')
        os.mkdir(root + '/target-only-directory'); file(root + '/target-only-directory/nested', b'delete nested\n')
        file(root + '/branch/target-only', b'delete branch\n')
        file(root + '/keep-dir/target-only-unselected', b'delete only if parent dumpdir selected\n')
    for rel in ['keep-dir', 'pristine', 'branch/unchanged']:
        q = root + '/' + rel; flags(q, flags(q) | 0x40)
        os.setxattr(q, 'user.binary', b'unchanged\0\xff')
    for rel in ['keep-dir/keep', 'pristine/keep']:
        q = root + '/' + rel; os.setxattr(q, 'user.binary', b'protected\0\xff'); flags(q, flags(q) | 0x10)
    os.chmod(root + '/change-dir', 0o750 if source else 0o755)
    os.setxattr(root + '/change-dir', 'user.changed', b'source' if source else b'target')
    # Set all mtimes after child creation. Parent timestamps are deliberately identical except change-dir.
    paths = inventory(root)
    for rel in sorted(paths, key=lambda x: -x.count('/')):
        ns = STAMP + (99 if rel == './change-dir' and not source else 0)
        q = root if rel == '.' else root + '/' + rel[2:]
        if paths[rel].get('flags', 0) & 0x10:
            old = flags(q); flags(q, old & ~0x10); os.utime(q, ns=(ns, ns), follow_symlinks=False); flags(q, old)
        else: os.utime(q, ns=(ns, ns), follow_symlinks=False)

def clear_immutable(root):
    if not os.path.isdir(root): return
    for rel in ['keep-dir/keep', 'pristine/keep']:
        p = root + '/' + rel
        if os.path.isfile(p) and not os.path.islink(p): flags(p, flags(p) & ~0x10)

def archive(root):
    p = subprocess.run(['tar', *CREATE, '-C', root, '-cf', '-', '.'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=ENV, timeout=15)
    assert p.returncode == 0 and p.stderr == b'', (p.returncode, p.stderr)
    assert len(p.stdout) < 1024 * 1024
    return p.stdout

def restore(data, target, selection, extra):
    # Separate in-memory fd for names; archive remains stdin. No persisted filename list.
    fd = os.memfd_create('synthetic-selection52', 0)
    try:
        names = b''.join(os.fsencode(n) + b'\0' for n in selection)
        assert os.write(fd, names) == len(names); os.lseek(fd, 0, os.SEEK_SET)
        p = subprocess.run(['tar', *EXTRACT, *extra, '-C', target, '-xpf', '-', '-T', '/proc/self/fd/' + str(fd)],
                           input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, pass_fds=(fd,), env=ENV, timeout=15)
        return {'exitCode': p.returncode, 'stderr': p.stderr.decode('utf8', 'backslashreplace'), 'selection': selection, 'extraOptions': extra}
    finally: os.close(fd)

def matched_fields(a, b):
    keys = ['type', 'mode', 'uid', 'gid', 'mtimeNs', 'xattrs', 'sha256', 'link']
    return all(a.get(k) == b.get(k) for k in keys)

os.mkdir(BASE)
source = BASE + '/source'
try:
    report['tarVersion'] = subprocess.check_output(['tar', '--version'], env=ENV, text=True).splitlines()[0]
    seed(source, True, '')
    data = archive(source)
    with tarfile.open(fileobj=io.BytesIO(data), mode='r:') as tf:
        members = [{'name': m.name, 'type': m.type.decode(), 'dumpdir': m.pax_headers.get('GNU.dumpdir')} for m in tf]
    report['archive'] = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'repeatIdentical': archive(source) == data, 'members': members}
    src = inventory(source)
    directories = [m['name'] for m in members if m['type'] == '5']
    basic = ['./branch/changed', *['./branch/' + n for n in ODD]]
    swaps = [m['name'] for m in members if m['name'].startswith('./swaps/') and m['type'] != '5']
    changed = basic + ['./change-dir/child'] + swaps
    needed_directories = [n for n in directories if n not in ['./keep-dir', './pristine']]
    cases = [('files-only', basic, []), ('needed-directories', needed_directories + changed, []),
             ('all-directories', directories + changed, []), ('all-directories-no-overwrite-dir', directories + changed, ['--no-overwrite-dir']),
             ('empty-selection', [], [])]
    for name, selection, extra in cases:
        root = BASE + '/' + name; os.mkdir(root)
        target, outside = root + '/target', root + '/outside'; os.mkdir(outside); file(outside + '/sentinel', b'outside synthetic sentinel\n')
        seed(target, False, outside)
        before, sentinel_before = inventory(target), inventory(outside)
        try:
            outcome = restore(data, target, selection, extra)
            after, sentinel_after = inventory(target), inventory(outside)
            checks = {
                'basicSelectedRestored': all(matched_fields(src[n], after.get(n, {})) for n in basic),
                'unselectedProtectedFilesExact': all(before[n] == after.get(n) for n in ['./keep-dir/keep', './pristine/keep']),
                'unselectedBranchFileExact': before['./branch/unchanged'] == after.get('./branch/unchanged'),
                'omittedChangedFileNotExtracted': before['./keep-dir/omitted-change'] == after.get('./keep-dir/omitted-change'),
                'pristineDirectoryExact': before['./pristine'] == after.get('./pristine'),
                'keepDirectoryExact': before['./keep-dir'] == after.get('./keep-dir'),
                'rootOnlyAbsent': './target-only-root' not in after and './target-only-directory' not in after,
                'branchOnlyAbsent': './branch/target-only' not in after,
                'unselectedDirectoryExtraAbsent': './keep-dir/target-only-unselected' not in after,
                'outsideSentinelExact': sentinel_before == sentinel_after,
                'allTypeSwapsRestored': all(matched_fields(src[n], after.get(n, {})) for n in src if n.startswith('./swaps/')),
                'selectedChangedDirectoryMetadataRestored': matched_fields(src['./change-dir'], after.get('./change-dir', {})),
                'emptySelectionLeavesEverythingExact': before == after,
            }
            tracked = ['.', './branch', './keep-dir', './pristine', './change-dir', './keep-dir/keep', './pristine/keep', './branch/unchanged']
            report['cases'][name] = {**outcome, 'checks': checks, 'before': {n: before[n] for n in tracked},
                'after': {n: after.get(n) for n in tracked}, 'changedPaths': [n for n in sorted(before.keys() | after.keys()) if before.get(n) != after.get(n)]}
        finally: clear_immutable(target)
    report['completed'] = True
finally:
    clear_immutable(source)
    shutil.rmtree(BASE)
    report['cleanup'] = {'syntheticTreeRemoved': not os.path.exists(BASE)}
print(json.dumps(report, separators=(',', ':')))
