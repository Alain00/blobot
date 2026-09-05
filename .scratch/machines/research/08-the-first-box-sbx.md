# The first box, measured: `sbx`

Ticket 16's `sbx` record, measured 2026-09-04 on Guillermo's Mac: macOS 26.6.2, Apple M4 Pro,
12 cores, 24 GiB; `sbx` v0.39.0, logged in (`sbx diagnose`: *authenticated*); Docker Desktop's
daemon stopped and never started. Every line is [OBS]; zero tokens (`--version`, `auth status`,
`initialize`, one `session/new` with no prompt). Companion to `research/07-the-first-box.md`.
Scripts are quoted at the end.

**One state change outlives this record.** `sbx policy ls` said `ERROR: global network policy
has not been initialized`, a documented prerequisite for the first sandbox; I ran **`sbx policy
init deny-all`**, the only base under which an egress row measures anything. `sbx policy reset`
undoes it.

## 1. State

| command | output |
|---|---|
| `sbx ls` | `No sandboxes found.` |
| `sbx version` | `v0.39.0 def8cb0523a77e757bdd6ef52b459fe374f3783e` |
| `sbx daemon status` | `Status: running`; state under `~/Library/Application Support/com.docker.sandboxes/` |
| daemon process | `/opt/homebrew/bin/sbx daemon start`, **106 MB RSS** idle; the same pid is the proxy (`lsof`: `127.0.0.1:65273`) |
| `du -sh` data dir | `528K` before anything; cask `330M` |
| `sbx template ls` | `No template images found` |
| `daemon.log` | `"msg":"uploaded event batch","module":"marlin/persist"` — telemetry leaves the machine |

`sbx run --help` lists ten agents: *claude, codex, copilot, cursor, docker-agent, droid, gemini,
kiro, opencode, shell*. No fx.

## 2. The mailbox door (`blobot-probe-a`, `shell`, bind-mounted `repo-a`)

`sbx policy allow network --help`: *"Use --sandbox to add the rule to policy "local" scoped to a
single sandbox"* — the form used; the global form was never run.

| command | output |
|---|---|
| `sbx create --name blobot-probe-a shell <repo-a>` | `image docker/sandbox-templates:shell-docker · cpu 12 · memory 12 GiB`; pull, `✓ Created` — **33.97 s** |
| `sbx policy allow network --sandbox blobot-probe-a localhost:46777` | `Rule added to policy local (scope: sandbox:blobot-probe-a): abf053bb… (localhost:46777)` |
| `sbx policy ls blobot-probe-a --wide` | my rule, plus a **kit** rule the shell agent brought: `allow openrouter.ai` |
| `sbx policy check network --sandbox blobot-probe-a …` | `host.docker.internal:46777` → `Denied` on paper; `localhost:46777` → `Allowed`. The `curl` decides: |
| `curl -s -H "Authorization: Bearer t" http://host.docker.internal:46777/` | `{"ok":true,"authorization":"Bearer t","host":"localhost:46777","remote":"127.0.0.1",…"user-agent":"curl/8.18.0","accept-encoding":"gzip"}` |
| host `listener.log` | `GET / from=127.0.0.1:65429 host=localhost:46777 auth="Bearer t"` — **bearer intact, `Host` rewritten, the peer is the proxy on host loopback**, no `Via`/`X-Forwarded-For` |
| `curl -sN --max-time 5 http://host.docker.internal:46777/sse` | `: ok`, then `data: {"n":1…}` `…2…` `…3…` 1.0 s apart, closed by the server — **3.0 s inside**, same upstream connection |
| `curl -s --max-time 4 http://127.0.0.1:46777/` | `BLOCKED rc=7` (refused: the VM's own loopback); `localhost:46777` also `rc=7` |
| `https://api.anthropic.com/`, `https://example.com/`, `http://169.254.169.254/` | **`403`, `403`, `403`** — the proxy answers, nothing times out. `curl -v`: `https_proxy == 'http://gateway.docker.internal:3128'`, `CONNECT example.com:443` |
| `sbx policy log blobot-probe-a` | Blocked: `169.254.169.254:80`, `example.com:443` ×2, `api.anthropic.com:443`, and **boot noise** `ports.ubuntu.com:80` ×4, `download.docker.com:443` — `REASON No matching allow rule (default deny)`. Allowed: `localhost:46777` ×1. `--json` exists |
| `ls ~/.ssh \| wc -l` | `0` |
| `ls /var/run/docker.sock`; `docker version` | `srw-rw---- root docker`; `Server: Docker Engine - Community 29.7.2` — **its own `dockerd`** inside (pids 90/103) |
| `id`; `sudo -n true` | `uid=1000(agent) gid=1000(agent) groups=1000(agent),27(sudo),1001(docker)`; `SUDO-OK` |
| `cat /proc/1/cmdline` | `tini -- sh -c trap 'kill -TERM -- -1; wait' TERM; sleep infinity & wait` |
| `uname -a` | `Linux blobot-probe-a 7.0.12 #1 SMP PREEMPT … aarch64`; `Ubuntu 26.04 LTS` |
| `df -h /`; `free -m`; `nproc` | `overlay 20G 580K used`; `Mem: 12128 total, 337 used, Swap 0`; `12` |
| `env \| grep -iE 'proxy\|SSH_AUTH\|CLAUDE\|SANDBOX'` | `HTTP(S)_PROXY=http://gateway.docker.internal:3128`, `NO_PROXY=localhost,127.0.0.1,::1,gateway.docker.internal`, `NODE_USE_ENV_PROXY=1`, **`PROXY_CA_CERT_B64`** (a *Docker Sandboxes Proxy CA*: TLS terminates at the proxy), `SSH_AUTH_SOCK=/run/ssh-agent.sock` (socat to the gateway), eight `proxy-managed` sentinels, `SBX_CRED_*_MODE=none`, `SANDBOX_*`, `BASH_ENV=/etc/sandbox-persistent.sh`; no `CLAUDE_*` |
| `/etc/hosts`; `mount` | `fe80::1 host.docker.internal`; workspace `host on <same absolute path> type virtiofs (rw,nosuid,nodev)` — **ADR-0004's mount holds** |
| `which node npm git curl claude` | `/usr/bin/node` v22.22.1, npm 9.2.0, git, curl 8.18.0; no `claude` |

## 3. `--clone` (`blobot-probe-b`)

| command | output |
|---|---|
| `sbx create --clone --name blobot-probe-b shell <wt/alice>`, alone and with `<repo-b>` beside it | **`ERROR: --clone is not supported when run from a Git worktree (…/wt/alice); run from the main repository instead`** — both times, 0.25 s |
| `sbx create --clone --name blobot-probe-b shell <repo-b>` | **3.9 s**: `Git daemon: git://127.0.0.1:49152/repo-b`, `Remote: sandbox-blobot-probe-b`, `mount <repo-b> → /run/sandbox/source (ro, source)`; `sbx ls` PORTS `127.0.0.1:49152->9418/tcp` |
| host `git config --get-regexp remote` | `url git://127.0.0.1:49152/repo-b`; **two** fetch refspecs: `+refs/heads/*:refs/remotes/sandbox-blobot-probe-b/*` and `+refs/heads/*:refs/sandboxes/blobot-probe-b/*` |
| inside: `pwd`; `git status -sb`; `git remote -v` | the clone sits at the repository's **own absolute path**; `## main...origin/main`; `origin /run/sandbox/source` |
| inside: `ps \| grep git` | `git-daemon --export-all --user=agent --base-path=<parent> --listen=0.0.0.0 --port=9418 <repo-b>` — **the daemon runs in the guest**, published to the host |
| inside: `git checkout blobot/probe/alice`; commit | `Switched to a new branch … set up to track 'origin/blobot/probe/alice'`; `b1f3544` |
| host `git fetch sandbox-blobot-probe-b` | **38 ms**: `[new branch] blobot/probe/alice -> sandbox-blobot-probe-b/blobot/probe/alice` and `-> refs/sandboxes/blobot-probe-b/blobot/probe/alice`; local `refs/heads/blobot/probe/alice` and the host worktree **unchanged** at `1ccd008` |
| `sbx rm -f blobot-probe-b` | warns *commits are lost on removal unless preserved first*; deletes the remote; **`refs/sandboxes/blobot-probe-b/*` stays** |

## 4. Cost

`daemon.log`: **`session disconnected, deferring auto-stop` (`delay: 30000000000`) →
`auto-stop grace period expired, stopping runtime`**. A box with no attached session stops itself
after 30 s, `sbx ls` says `stopped`, and the next `exec` boots it.

| figure | value |
|---|---|
| boot, template not pulled (`shell`, ~586 MB downloaded) | 33.97 s |
| boot, template pulled (`shell --clone`) | 3.9 s |
| boot, `claude` (shares layers; one 102.9 MB layer pulled) | 8.92 s |
| boot from a store-local snapshot (`-t`) | 3.7 s |
| `sbx stop` | 0.16 s |
| first `sbx exec` after a stop (boot + command) / next | **0.99 s** / 0.21 s |
| host RAM, shell VM running (`containerd-shim-nerdbox-v1` RSS) | 968 MB after create; 782 MB right after a restart |
| host RAM, claude VM running | 1.50 GB; 1.68 GB after the npm install and `session/new` |
| host RAM, stopped | shim process **gone**; daemon alone 161–180 MB (106 MB cold, 169 MB after `rm`) |
| guest | 12 vCPU, 12,128 MB (50 % of host), no swap, 20 G overlay root |
| disk, data dir | 528K → 2.1G (shell template + a, +b) → 2.5G (+claude layer + c) → 3.3G (after c's 659 MB `npm install`) → **2.4G after `rm`** (templates only) |
| template store (`template ls --json`) | `shell-docker` 588,725,040 B; `claude-code-docker` 936,879,795 B; snapshot of c 1,962,159,490 B, its tar 1,091,766,784 B |

## 5. Docker's `claude` template, zero tokens (`blobot-probe-c`)

| command | output |
|---|---|
| `sbx create --name blobot-probe-c claude <repo-a>` | 8.92 s; `skills ~/Library/…/sandboxes/agent-skills → /home/agent/.claude/skills · 0 folders` |
| `claude --version` | `2.1.246 (Claude Code)` at `/home/agent/.local/bin/claude`; node v22.22.1 `/usr/bin/node` |
| `claude auth status` | `"loggedIn": false, "authMethod": "none"`, rc 1; no `~/.claude/.credentials.json` |
| `~/.claude.json`; `~/.claude/settings.json` | `hasCompletedOnboarding: true`, trust pre-accepted; **`"defaultMode": "bypassPermissions", "bypassPermissionsModeAccepted": true, "skipDangerousModePermissionPrompt": true`** |
| `mount \| grep ext4` | five ext4 volumes under `~/.claude/` (`projects` 2.0G, `sessions`, `todos`, `shell-snapshots`, `statsig`) plus `/var/lib/docker`; **`~/.claude` itself is overlay**, so a login written there is not in a volume |
| `sbx policy ls blobot-probe-c --wide` | kit allow: `api.anthropic.com:443 bridge.claudeusercontent.com:443 claude.com:443 downloads.claude.ai:443 mcp-proxy.anthropic.com:443 platform.claude.com:443` — nothing else |
| `sbx policy log blobot-probe-c` after boot | Allowed `api.anthropic.com:443` ×2, `PROXY forward-bypass` (kit hosts are not intercepted); the same boot noise blocked |
| `npm install @agentclientprotocol/claude-agent-acp@0.70.0` under the default policy | **`npm ERR! 403`**; log: `registry.npmjs.org:443 … No matching allow rule` |
| after `sbx policy allow network --sandbox blobot-probe-c registry.npmjs.org` | ~9 s, 99 packages, **659 MB**: `claude-agent-sdk-linux-arm64` 306M + `-musl` 299M (two bundled `claude`s beside the template's own); the bridge itself 708K |
| `sbx exec -i blobot-probe-c node …/claude-agent-acp/dist/index.js < init.json` | **0.43 s**, rc 0 on EOF, **stderr empty**: `result: protocolVersion 1 · mcpCapabilities {http, sse} · loadSession true · agentInfo @agentclientprotocol/claude-agent-acp 0.70.0 · authMethods []` — empty with the CLI signed out, so `initialize` does not reveal it |
| same with `-e CLAUDE_CODE_EXECUTABLE=/home/agent/.local/bin/claude -w <repo-a>` | identical, 0.49 s — `-e`/`-w` carry env and cwd |
| `initialize` + `session/new` with `mcpServers:[{type:http,url:http://host.docker.internal:46777/agents/x/mcp,headers:[Authorization: Bearer x-session-new]}]` (after a scoped `localhost:46777` allow) | `{"id":2,"result":{"sessionId":"c8527901-…","modes":{"currentModeId":"default",…six modes…}}}` then `available_commands_update`; stderr one line `[session/query] sessionId=… resume=none apiType=native baseUrl=native` |
| host `listener.log` | **`POST /agents/x/mcp from=127.0.0.1:49838 host=localhost:46777 auth="Bearer x-session-new" ua=claude-code/2.1.246 (sdk-ts, agent-sdk/0.3.232)`** — the real CLI dialled the mailbox through the door, bearer intact |
| `sbx policy log blobot-probe-c` after | `api.anthropic.com:443` ×9, `mcp-gateway.docker.internal:80` ×3 (the kit also points the CLI at sbx's own MCP gateway), `localhost:46777` ×2; `~/.claude/projects` still 520K — no session file until a prompt |

## 6. A hand-built image under `-t`

`-t, --template   Container image to use for the sandbox (default: agent-specific image)`;
`template load FILE` loads *"an image from a tar file"*, `template save --output` exports one;
`kit add` takes *"a local directory, ZIP file path, OCI registry reference, or git repository"*.

| command | output |
|---|---|
| `sbx create -t blobot-probe:snap …` with no such tag in the store | `→ pull blobot-probe:snap` **`ERROR: request failed: 403 Forbidden: pull failed`** — an unknown `-t` is a registry reference (`docker.io/library/…`) |
| `sbx template save blobot-probe-c blobot-probe:snap --output snap.tar` | refused while running; after `sbx stop`: 28 s, store 1.96 GB, tar 1.09 GB |
| `sbx create -t blobot-probe:snap --name blobot-probe-d shell <repo-a>` | `→ pull blobot-probe:snap ✓ image ready` **3.7 s, nothing downloaded** — a store-local tag is used as is |
| inside d | `claude` 2.1.246 and the bridge present, uid 1000, **one** ext4 mount, **eight** sentinels — volumes and credentials are the **agent kit's** (`shell` here), not the image's |

So a blobot image needs **no Docker daemon on the Mac**: a tar from CI through `sbx template
load`, or a registry pull, then `-t`. The contract on a `node:22` base is untested; Docker's
template shows it: `agent` uid 1000 in `sudo`+`docker`, `/home/agent`, `tini` as pid 1,
`/etc/hosts`, `/etc/resolv.conf`, proxy variables and `BASH_ENV` injected by the runtime.

## 7. Cleanup

`sbx rm -f blobot-probe-a blobot-probe-b blobot-probe-c` → three `removed` in ~1 s; `sbx ls` →
`No sandboxes found.`; `sbx policy ls --wide` → only `default-deny-all` and the filesystem defaults
(**scoped rules die with their sandbox**); both pulled templates kept; listener killed, port
46777 free; data dir 2.4G; daemon 169 MB.

## What this settles for tickets 05, 13, 14, 15

- **05.** `--clone` refuses a worktree, with or without the repository beside it. What works: the
  repository as the primary path, the branch checked out inside, `git fetch sandbox-<name>`
  bringing it home under `refs/remotes/sandbox-<name>/<branch>` and `refs/sandboxes/<name>/<branch>`,
  the host branch never moved. The clone sits at the repository's own path, `origin` the
  read-only mount; the git daemon is the guest's; removal keeps `refs/sandboxes/*`.
- **13.** Docker's template: Ubuntu 26.04, node 22.22.1, `claude` 2.1.246 in `~/.local/bin`, its
  own `dockerd`, `defaultMode: bypassPermissions`, `~/.claude` not a volume (five subdirectories
  are). The npm bridge drags in 605 MB of bundled `claude` unless `CLAUDE_CODE_EXECUTABLE` is
  pinned. `-t` takes a store-local tag or a registry reference; `template load` takes a tar.
- **14.** `sbx exec -i` carries JSON-RPC both ways with empty stderr, `-e`/`-w` set env and cwd,
  EOF ends it cleanly. A box auto-stops 30 s after its last session, restarts in ~1 s on the next
  `exec`, and costs nothing stopped; running, 0.8–1.7 GB host RSS, 12 GiB/12 vCPU by default
  (`-m`, `--cpus` exist).
- **15.** The bearer arrives unchanged and `Host` becomes `localhost:<port>`; SSE stays open
  through the proxy; the VM's loopback is not the host's; a refusal is a synthesized **403**,
  logged per host with count and reason, beside the template's own boot noise; the proxy holds a
  CA and `forward-bypass`es kit hosts; a real `claude` dialled the mailbox via `mcpServers`.

## What is still unmeasured

- **The login inside**: `claude /login` in a box — the OAuth hop through the proxy, and whether
  `.credentials.json` lands on the overlay rather than a volume.
- **A real turn**: tokens, `_meta.claudeCode.options` through the bridge, whether the kit's
  `bypassPermissions` default reaches a bridge session (`session/new` reported `default`).
- **A blobot image** under `-t`: the contract on a `node:22` base, and `~/.claude` absent
  (ADR-0003; Docker's template pre-seeds it, so it could not be asked here).
- `sbx login` on screen; Linux/KVM (Alain); the other four runtimes' templates.

## Scripts as run

```js
// listener.mjs — stands in for peer-message-server.ts on 127.0.0.1:46777
import { createServer } from 'node:http'; import { appendFileSync } from 'node:fs';
const log = (l) => appendFileSync(new URL('./listener.log', import.meta.url).pathname, `${new Date().toISOString()} ${l}\n`);
createServer((req, res) => {
  const auth = req.headers.authorization ?? null;
  log(`${req.method} ${req.url} from=${req.socket.remoteAddress}:${req.socket.remotePort} host=${req.headers.host} auth=${JSON.stringify(auth)} ua=${req.headers['user-agent'] ?? ''} xff=${req.headers['x-forwarded-for'] ?? ''} via=${req.headers.via ?? ''}`);
  if (req.url === '/sse') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    res.write(': ok\n\n'); let n = 0;
    const t = setInterval(() => { n += 1; res.write(`data: {"n":${n},"at":"${new Date().toISOString()}"}\n\n`); if (n === 3) { clearInterval(t); res.end(); log('sse closed after 3 events'); } }, 1000);
    req.on('close', () => clearInterval(t)); return;
  }
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ ok: true, authorization: auth, host: req.headers.host, remote: req.socket.remoteAddress, headers: req.headers }));
}).listen(46777, '127.0.0.1', () => log('listening on 127.0.0.1:46777'));
```

```sh
# host: repos, listener, policy, sandbox a, probe
git init -q repo-a && (cd repo-a && echo one>a.txt && git add . && git commit -qm one && echo two>b.txt && git add . && git commit -qm two)
git init -q repo-b && (cd repo-b && echo base>README.md && git add . && git commit -qm base && git worktree add -q -b blobot/probe/alice ../wt/alice HEAD)
nohup node listener.mjs >listener.out 2>&1 &
sbx policy init deny-all
/usr/bin/time -l sbx create --name blobot-probe-a shell "$PWD/repo-a"
sbx policy allow network --sandbox blobot-probe-a localhost:46777
sbx exec -i blobot-probe-a bash -s < probe-inside.sh; sbx policy log blobot-probe-a
# probe-inside.sh (inside): the step-2 rows, each as `printf '\n## %s\n' "<cmd>"; <cmd> || echo "BLOCKED rc=$?"`
#   curl -s --max-time 5 -H "Authorization: Bearer t" http://host.docker.internal:46777/
#   curl -sN --max-time 5 http://host.docker.internal:46777/sse
#   curl -s --max-time 4 http://127.0.0.1:46777/ ; …localhost:46777/
#   curl -s --max-time 8 -o /dev/null -w '%{http_code}\n' https://api.anthropic.com/ ; https://example.com/ ; http://169.254.169.254/
#   ls ~/.ssh|wc -l; ls -la /var/run/docker.sock; docker ps|head -2; docker version; id; sudo -n true && echo SUDO-OK
#   tr '\0' ' ' </proc/1/cmdline; uname -a; df -h / /home; free -m; nproc; env|grep -iE 'proxy|SSH_AUTH|CLAUDE|SANDBOX|SBX'|sort
#   getent hosts host.docker.internal; cat /etc/hosts /etc/resolv.conf; git status -sb; git log --oneline; mount|grep -E "$(pwd)|virtiofs|overlay"
#   which node npm git curl claude; node --version; head -3 /etc/os-release; ps -eo pid,user,rss,cmd|head -25
# step 4
sbx stop blobot-probe-a; ps -axo rss,command | grep -E '[s]bx daemon|[c]ontainerd-shim-nerdbox'; /usr/bin/time -l sbx exec blobot-probe-a uname -r
# step 3
sbx create --clone --name blobot-probe-b shell "$PWD/wt/alice"            # refused
sbx create --clone --name blobot-probe-b shell "$PWD/wt/alice" "$PWD/repo-b"  # refused
sbx create --clone --name blobot-probe-b shell "$PWD/repo-b"
sbx exec -i blobot-probe-b bash -c 'git status -sb; git branch -a; git remote -v; ps -eo pid,user,cmd|grep [g]it; git checkout blobot/probe/alice; git config user.email alice@blobot.local; git config user.name alice; echo x>inside.txt; git add .; git commit -qm "inside"; git rev-parse HEAD'
git -C repo-b fetch sandbox-blobot-probe-b; git -C repo-b for-each-ref | grep sandbox; git -C repo-b worktree list
# step 5
sbx create --name blobot-probe-c claude "$PWD/repo-a"
sbx exec -i blobot-probe-c bash -c 'claude --version; claude auth status|head -3; ls -la ~/.claude; cat ~/.claude/settings.json; mount|grep ext4; which node claude; mkdir -p ~/bridge && cd ~/bridge && npm init -y >/dev/null && npm install --no-audit --no-fund --fetch-retries=0 @agentclientprotocol/claude-agent-acp@0.70.0'
sbx policy allow network --sandbox blobot-probe-c registry.npmjs.org   # then the same npm install, 659 MB
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1,"clientCapabilities":{"fs":{"readTextFile":false,"writeTextFile":false}}}}' > init.json
perl -e 'alarm 30; exec @ARGV' sbx exec -i -e CLAUDE_CODE_EXECUTABLE=/home/agent/.local/bin/claude -w "$PWD/repo-a" blobot-probe-c node /home/agent/bridge/node_modules/@agentclientprotocol/claude-agent-acp/dist/index.js < init.json
sbx policy allow network --sandbox blobot-probe-c localhost:46777
# session-new.json = init line + {"jsonrpc":"2.0","id":2,"method":"session/new","params":{"cwd":"<repo-a>","mcpServers":[{"type":"http","name":"blobot","url":"http://host.docker.internal:46777/agents/x/mcp","headers":[{"name":"Authorization","value":"Bearer x-session-new"}]}]}}
(cat session-new.json; sleep 25) | perl -e 'alarm 60; exec @ARGV' sbx exec -i -e CLAUDE_CODE_EXECUTABLE=/home/agent/.local/bin/claude -w "$PWD/repo-a" blobot-probe-c node /home/agent/bridge/node_modules/@agentclientprotocol/claude-agent-acp/dist/index.js
# step 6, 7
sbx stop blobot-probe-c; sbx template save blobot-probe-c blobot-probe:snap --output snap.tar; sbx create -t blobot-probe:snap --name blobot-probe-d shell "$PWD/repo-a"
sbx rm -f blobot-probe-d; sbx template rm blobot-probe:snap; sbx rm -f blobot-probe-a blobot-probe-b blobot-probe-c; pkill -f 'node listener.mjs'
```
