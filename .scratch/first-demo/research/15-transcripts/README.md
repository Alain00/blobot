# 15 — loopback HTTP MCP transcripts

Scripts:
- `httpmcp.mjs`   — the MCP server under test: Streamable HTTP on 127.0.0.1, one tool
                    `message_agent({agent,message})`. Env: PORT, LOG, TOKEN, MODE, DIE_AFTER.
- `drive-http.mjs`— ACP stdio driver; AGENT=opencode|claude, SCENARIO=basic|twoturns|load.
- `run.sh`        — start server + driver, dump both logs. `SRV_EXTRA=` for server env,
                    `DEAD_PORT=` to point the driver at a closed port.
- `run-restart.sh`— fixed-port server under a restart loop (reconnection test).

Runs (`oc` = OpenCode 1.18.4, `cc` = @agentclientprotocol/claude-agent-acp 0.70.0 + claude 2.1.251):

| tag | scenario |
|---|---|
| `*1`               | happy path, bearer token, discovery + invocation |
| `*2-unreachable`   | URL points at a closed port at `session/new` |
| `*3-midturn`       | server exits without answering the 2nd `tools/call` |
| `*4-load-with`     | `session/load` in a fresh process, `mcpServers` re-supplied |
| `*5-load-without`  | `session/load` with `mcpServers: []` |
| `*6-badtoken`      | server requires a token, client sends the wrong one |
| `*7-restart`       | server dies mid-call then restarts on the same port; 2nd turn same session |

`*.jsonl` = ACP frames (client view). `*-server.log` = raw HTTP requests incl. headers (server view).
