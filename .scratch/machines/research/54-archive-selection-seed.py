# Only generated fixture paths below a newly created disposable guest tree.
import os,sys,itertools
BASE=sys.argv[1]
STAMP=1700000000123456789
CASES=['identical','content-parent-equal','mutations','hardlink-reference','hardlink-merge','hardlink-split']
ODD=[b'-dash',b' leading\ttrailing ',b'line\nbreak',b'back\\slash',b'literal[*]?', 'café'.encode(), b'byte-\xff']
def put(p,data=b'synthetic stable\n'):
    with open(p,'wb') as f:f.write(data)
def item(p,kind,source,outside):
    if kind=='file':put(p,b'source file\n' if source else b'target file\n')
    elif kind=='directory':os.mkdir(p);put(p+b'/child',b'source child\n' if source else b'target child\n')
    elif kind=='symlink':os.symlink(b'dangling-synthetic' if source else outside,p)
    elif kind=='fifo':os.mkfifo(p,0o640)
def stamps(root):
    for current,dirs,files in os.walk(root,followlinks=False):
        for n in files+dirs:os.utime(os.path.join(current,n),ns=(STAMP,STAMP),follow_symlinks=False)
        os.utime(current,ns=(STAMP,STAMP),follow_symlinks=False)
os.mkdir(BASE)
for case in CASES:
    root=os.fsencode(BASE+'/'+case);os.mkdir(root)
    outside=root+b'/outside';os.mkdir(outside);put(outside+b'/sentinel')
    for source in [True,False]:
        tree=root+(b'/source' if source else b'/target');os.mkdir(tree)
        os.mkdir(tree+b'/unchanged');put(tree+b'/unchanged/keep')
        if case=='identical':
            os.mkdir(tree+b'/nested');put(tree+b'/nested/file')
            os.setxattr(tree+b'/nested/file',b'user.synthetic',b'x\0\xff')
        elif case=='content-parent-equal':
            os.mkdir(tree+b'/a');os.mkdir(tree+b'/a/b')
            put(tree+b'/a/b/file',b'SOURCE' if source else b'TARGET')
        elif case=='mutations':
            os.mkdir(tree+b'/odd');os.mkdir(tree+b'/swaps')
            for n in ODD:put(tree+b'/odd/'+n,b'SOURCE' if source else b'TARGET')
            for a,b in itertools.permutations(['file','directory','symlink','fifo'],2):
                path=tree+b'/swaps/'+(a+'-from-'+b).encode()
                kind=a if source else b
                # Target symlinks point only inside this synthetic fixture; all are no-follow snapshots.
                endpoint=outside if a=='directory' else outside+b'/sentinel'
                item(path,kind,source,endpoint)
            if source:
                os.mkdir(tree+b'/added');put(tree+b'/added/new')
            else:
                put(tree+b'/removed-root');os.mkdir(tree+b'/removed-dir');put(tree+b'/removed-dir/child')
                put(tree+b'/odd/removed\nbyte-\xff')
        else:
            os.mkdir(tree+b'/links')
            put(tree+b'/links/a',b'NEW!' if case=='hardlink-reference' and source else b'OLD!' if case=='hardlink-reference' else b'SAME')
            linked=case=='hardlink-reference' or (case=='hardlink-merge' and source) or (case=='hardlink-split' and not source)
            for name in [b'b',b'c']:
                if linked:os.link(tree+b'/links/a',tree+b'/links/'+name)
                else:put(tree+b'/links/'+name,b'SAME')
        stamps(tree)
    stamps(outside)
