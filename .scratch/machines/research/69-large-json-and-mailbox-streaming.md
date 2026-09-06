# RC5 large JSON and generic mailbox streaming

Measured 2026-09-06, 01:30:40–01:30:42 UTC. Bounded mechanical follow-up to the
transport/SSE gaps in [53](53-first-box-evidence-ledger.md), using the first
disposable Claude VM from [68](68-browser-env-first-results.json) after its login
had already been cancelled.

**A valid 6 MiB JSON document survives the real `spawnSbxTransport` round trip,
both as one write and as chunks, with matching lengths/hashes and normal EOF.**
The slow-reader case visibly backpressures the guest writer. A separate generic
mailbox-shaped SSE fixture delivers progressive events, observes client abort,
then reconnects with `Last-Event-ID` and finishes normally. Neither test invokes
a provider runtime, prompt or login.

Primary evidence: [receipt](69-transport-stream-results.json),
[probe module](69-transport-stream-probes.mts) and
[owning fixture](68-browser-env-and-69-transport-fixture.mts). The receipt links
the exact first-VM admission/cleanup record and includes source-hash metadata.
No production code or tracker was changed.

## Subject and JSON contract

Host macOS arm64; engine client/server `v0.42.0-rc5`, revision
`ca4a4bd42035628137d78c5a0bef5c0d3301a35a`, API 0.28.0. The VM used the published
Claude arm64 image described in 68, fixed at 2 vCPU/2 GiB with its private volumes
and synthetic linked worktree. This is actual sbx exec through the production
[transport](../../../packages/core/src/machines/sbx/transport.ts) and
[bootstrap](../../../packages/core/src/machines/sbx/bootstrap.ts), not the local
Node-only bootstrap unit test identified in 53.

The JSON-RPC-shaped document contains a deterministic synthetic string in
`params.data`, using the base64 alphabet. It has method `research69/echo` and a
numeric id; the fixture guest parses it as JSON and validates that method.

| Value | Source, guest and returned observation |
| --- | --- |
| JSON document | 6,291,456 UTF-8 bytes, exactly 6 MiB |
| Wire record | 6,291,457 bytes, including one trailing LF |
| Document SHA-256 | `e669c94b00e5e30aa849e7a58931ac29ee6047163a6492c1c4781ad920d1094f` |
| Return | Exactly one JSON line; parsed data length and document SHA-256 match |
| Input EOF | Guest explicitly observed EOF and the LF delimiter |
| Channel close | Normal, no error/signal reason, in both cases |

The guest accepts at most 7 MiB, waits for input EOF, parses the whole document,
then replays the original bytes in 64-KiB writes, awaiting `stdout` drain when
requested. Metadata only is emitted on stderr; the large payload is not retained
as an artifact. The production launch header stays small and separate from this
protocol record, so its 1-MiB limit does not limit the tested JSON payload.

## Chunking and backpressure observations

| Observation | Whole-line write | Chunked, slow host reader |
| --- | ---: | ---: |
| Payload writes | 1 | 192, each at most 32,771 characters/bytes |
| Guest input chunks | 221 | 241 |
| Guest output chunks | 97 | 97 |
| Guest writes returning false | 71 | 55 |
| Longest guest drain wait | 1 ms | 371 ms |
| Guest output duration | 14 ms | 395 ms |
| Host stdin writes returning false | 1 | 190 |
| Peak observed host stdin writable length | 6,291,457 bytes | 6,258,686 bytes |
| Final host stdin writable length | 0 | 0 |
| Round-trip and close | 362.72 ms | 742.95 ms |

The second test waits 700 ms before starting its host line reader. The longer
guest drain wait shows downstream pressure reaching that writer. Host write
instrumentation wraps only the fixture's spawned child stream, preserving all
arguments and return values; the temporary spawn instrumentation is restored
immediately after channel construction. Counts in the raw receipt include one
additional bootstrap-header write.

**Limit:** [MachineTransport.write](../../../packages/core/src/machines/machine.ts)
returns `void`; the caller is not given a boolean or awaitable drain. The test
deliberately uses that public interface and observes its underlying writable
returning false while buffering roughly the entire record. This proves successful
delivery of the bounded record under pressure, not a producer API with bounded
queue memory. There were no host drain events before EOF/close in these runs;
successful delivery and zero final writable length do not manufacture such an
event. The memory of other stages was not measured.

The ordinary [child transport close](../../../packages/core/src/adapters/acp/child-transport.ts)
sends stdin EOF and retains its existing 2-second kill fallback. Both measurements
finished normally well before it. They do not establish behavior for arbitrarily
large frames, indefinitely stalled peers or a real runtime's attachment decoder.

## Generic SSE abort and reconnect

A fixture HTTP server bound host loopback and required a fresh in-memory synthetic
bearer. The guest used its existing curl through the engine's ordinary proxy and
`host.docker.internal`, targeting `/agents/research69/mcp`. It is a **generic
mailbox-shaped SSE server**, not `PeerMessageServer` or a provider MCP client.
No bearer value was written to the report.

| Connection | Guest events and elapsed times | Host observation |
| --- | --- | --- |
| First | id 1 at 190 ms; id 2 at 373 ms; client curl cancelled by SIGTERM | Correct bearer arrived; connection closed at 370.52 ms after request handling began; no server EOF was needed to deliver those events |
| Reconnected | `Last-Event-ID: 2`; ids 3, 4, 5 at 191, 373, 555 ms; curl exited 0 at server EOF | Correct bearer and last-event header arrived; three events sent progressively, then connection closed |

The event spacing is observed at the guest, not merely inferred from the host's
timer; it rules out buffering everything until EOF for these streams. Separate
clocks explain the small difference between guest elapsed and host elapsed values.
The fixture implements the last-event numbering itself and starts the second
curl explicitly. This measures the engine's short streaming/reconnect/abort path;
it does not certify automatic reconnection or resume semantics in a runtime MCP
client, production mailbox event replay, a server restart or prolonged idle SSE.

The owning first VM was then confirmed stopped and removed. Final inventory had
no boxes and only the unchanged initial vendor templates; its exact temporary
repository, worktree, journal and downloaded image cache were removed. The later
repeat in 68 did not rerun or overwrite these successful mechanical measurements.
