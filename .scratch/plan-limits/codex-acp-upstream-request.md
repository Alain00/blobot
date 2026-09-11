Status: draft, not filed. File only with the author's go-ahead.

Target: the `@agentclientprotocol/codex-acp` repository.

---

## Forward `account/rateLimits/updated` to the ACP client

**What happens.** codex-acp receives `account/rateLimits/updated` from the app-server and stores
it on the session state (`dist/index.js` in 1.7.0, around line 24380), then returns `null`. The
only place a client can see it afterwards is the prose of the bridge's own `/status` reply
(`buildStatusMessage` / `formatSingleRateLimit`).

**Why a client wants it.** A client showing an account's rate limit windows beside its context
gauge has to either send `/status` and parse English, which breaks on any wording change, or go
without. The Claude ACP bridge already forwards the equivalent, on `usage_update`:

```json
{"sessionUpdate":"usage_update","used":32281,"size":1000000,
 "_meta":{"_claude/rateLimit":{"unifiedWindows":{
   "five_hour":{"utilization":0.41,"resetsAt":1788021600},
   "seven_day":{"utilization":0.14,"resetsAt":1788242400}}}}}
```

**Proposal.** When `account/rateLimits/updated` arrives, send a `usage_update` (or attach to the
next one) carrying the payload under a namespaced `_meta` key, for example
`_meta["_codex/rateLimits"]`, with `primary` and `secondary` as the app-server sends them
(`usedPercent`, `resetsAt`, `windowDurationMins`). No change to the stable schema is needed.
