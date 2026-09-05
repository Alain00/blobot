Type: task
Status: resolved

# What reading the folder actually costs

## Question

Ticket 03 has to choose between one walk and a lazy read per directory, and between re-reading on
turn settle and watching the filesystem. Neither choice can be made from an armchair, and this
repository is sitting right here with real AgentWorkspaces under
`~/.local/share/blobot/worktrees/`.

Measure, on a real worktree of this repo and on at least one larger checkout:

1. `git status --porcelain=v2` — wall time, and how it moves with the size of the working tree.
2. `git ls-files --others --exclude-standard` and `git check-ignore` over a directory listing —
   the cost of knowing what is dimmed, and whether one invocation can answer a whole directory.
3. A plain `readdir` of one directory versus a full recursive walk, at the repository root and
   inside `node_modules`. `workspace/icon.ts` already does *one walk four levels deep* and is the
   only precedent in the building; find out what it costs there.
4. How many entries a directory in this repo actually holds, and what the worst one is. The
   per-directory ceiling in *Already decided* 8 needs a number that is not invented.
5. Whether the same numbers hold in a `nested` Workspace, which is a folder of repositories.

Nothing to decide here. The answer is a table of figures on this ticket, and 03 is blocked until
it exists.

## Answer

Measured 2026-09-05 on this machine, warm page cache, medians of three to five runs. Every figure
below includes the process spawn, which is itself 1–2 ms and is the floor under all of the git
numbers.

### The headline: git is flat and cheap, the filesystem is not

| | tracked | files on disk | `git status --porcelain=v2` |
|---|---|---|---|
| `blobot` (this repo, `node_modules` installed) | 735 | 29,171 | **3 ms** |
| `blobatar/bob` — a real AgentWorkspace, deps installed | 538 | 68,232 | **3 ms** |
| `blobatar/alice` — a clean worktree, no deps | 510 | 486 | **3 ms** |
| `personal/hermes-agent` | 10,204 | — (3.1 GB) | **15 ms** |
| `erpnext` | 4,370 | — (1.4 GB) | **9 ms** |

`git status` does not descend into an ignored directory, so **68,000 files on disk cost the same
as 486**. What it scales with is the number of *tracked* files, and it takes 10,000 of them to
reach 15 ms.

The walk is the opposite:

| | |
|---|---|
| `fs.readdirSync(dir, {withFileTypes:true})`, one directory | **0.06 ms** |
| `fs.readdirSync('.', {recursive:true})`, whole repo | **535 ms**, 123,021 entries |
| `find . -type f`, `blobatar/bob` | **80 ms** |

A recursive walk of an AgentWorkspace with dependencies installed costs **half a second and
returns 123,000 entries**, of which about 700 are the user's. One directory costs 0.06 ms, which
is nothing. The gap between those two numbers is the whole of ticket 03's first decision, and it
is four orders of magnitude wide.

### `-unormal` versus `-uall`, and why the default is the right one

Untracked files, synthetic worktree:

| untracked files | `-unormal` | `-uall` | rows `-unormal` | rows `-uall` |
|---|---|---|---|---|
| 100 | 2 ms | 2 ms | 1 | 100 |
| 1,000 | 2 ms | 2 ms | 1 | 1,000 |
| 5,000 | 2 ms | 5 ms | 1 | 5,000 |
| 20,000 | 3 ms | **15 ms** | 1 | 20,000 |

`-unormal` collapses an untracked directory to a single `? junk/` row and is **flat** regardless
of what is inside it. `-uall` is linear. The flat one is also the one whose shape matches a lazy
tree: `? junk/` is exactly the fact *there is something new in here, expand me to find out*, and
it costs nothing to learn for a directory nobody opens.

### Knowing what is ignored: one batched invocation, and it cannot be derived

`git check-ignore --stdin -n -v` answers a whole directory in one process and prints a verdict per
line (`::` for not-ignored, else the rule that matched):

| paths in one invocation | |
|---|---|
| 17 (this repo's root) | **2 ms** |
| 4,098 (the worst directory in `node_modules`) | **27 ms**, ≈6.6 µs per path |

Real directories are far smaller than that ceiling — see below — so this is spawn cost plus noise.

**It cannot be replaced by deriving from `ls-files` and `status`.** Tested directly: an *ignored*
directory and an *empty untracked* directory are both absent from `git ls-files` and from
`git status` output, so the two lists cannot tell them apart, and drawing an empty folder as
ignored is a false statement about the user's repository. The cheap derivation is wrong in exactly
the case it would be silent about.

One more thing the batch showed: **`check-ignore` reports `.git` as not ignored** (`::`). The tree
must exclude `.git` by its own rule, not by asking git.

### How big a directory actually gets

Worst directory in this repo, excluding `.git`:

- With `node_modules`: **4,098** entries (`lucide-react/dist/esm/icons`), then 583, 469, 355.
- Without `node_modules`: **55** entries (`apps/desktop/src/renderer/src/components`), then 53,
  52, 48, 42.

So the per-directory ceiling in *Already decided* 8 has a real shape: **outside the ignored tree
nothing here exceeds 55**, and the pathological directories are all inside exactly the folders the
tree will not descend into unless asked. A ceiling around 500 would never fire on a normal
directory and would still cap the one an author deliberately opens.

### `nested`, measured on a real one

`~/Projects/contapp` is a genuine nested Workspace: **22 top-level entries, 18 of them git
repositories and 4 not** (`aws-terraform-contapp`, `contapp-cypress`, `contapp-testsigma`,
`worktrees`). Ticket 05's mixed root is not hypothetical.

| 22 directories, `git status` each | |
|---|---|
| serial | **231 ms** |
| parallel (`Promise.all`) | **26 ms** |

Serial is a visible pause; parallel is not, and the ceiling is the number of repositories a person
put in one folder, not the size of any of them.

### What this leaves for 03

1. **Lazy directories are not a compromise, they are the only option.** 0.06 ms versus 535 ms.
2. **The changed set is free** at 3 ms and does not scale with the size of the working tree, so
   re-reading it whenever a turn settles costs nothing, and the `-unormal` shape hands the lazy
   tree its roll-up (`? dir/`) without a second source.
3. **The staleness question is therefore not about cost.** 03 cannot justify a filesystem watcher
   on performance grounds — a re-read is 3 ms — so the watcher argument has to be made on
   *liveness during a turn* alone, and rejecting it costs nothing either. That is a decision about
   what the reader should see, which is what 03 is for.
4. `check-ignore` is one batched call per expanded directory, ~2 ms, and it earns its place
   because the derivation is wrong about empty directories.

### Caveats

Warm page cache throughout; cold-start figures will be worse and were not obtainable without root.
`hermes-agent`'s 15 ms is the largest checkout on this machine, so the tracked-file scaling is
established up to 10,000 files and extrapolated above it. No measurement was taken on a network
filesystem, which is where every number here would change.
