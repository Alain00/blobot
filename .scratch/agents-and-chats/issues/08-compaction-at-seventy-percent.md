Type: grilling
Status: open
Blocked by: none

# Compaction at 70%, exposed in config, and the DM that compacts on its own

## Question

`.scratch/transcript-scale/10` fires the handoff at **80%** of the runtime's working ceiling
(`context_ceilings`), occupancy-triggered, with a refusal to restart if the handoff stops early,
is empty, or exceeds 6,000 characters. The author moves the threshold to **70%** and wants it
*exposed in config*, with the DM being the conversation that compacts most, since it is the
one that never ends.

Decide, with the author:

- **Where 70% lives.** A default in core (`compaction.ts`), read from a config the user can edit,
  with a per-agent override in tokens or percent. Settings is a door with one section today
  (the machine); is this its second section, or does it sit on the Agent's definition?
  Recommendation: a default in Settings, the override on the Agent under *starting over when it
  runs out of room*, both as percent, never a raw token count on screen.
- **Why 70 and not 80.** Record the reason so the number is not a magic constant: the DM is
  long-lived and the handoff turn is the most expensive available; more margin buys a handoff
  that finishes.
- **The live test.** `orchestrator/live-compaction.test.ts` trips the threshold by injecting a
  small `contextCeilings` entry; confirm it needs no change beyond the constant.
- **Handoff archive.** `~/.local/share/blobot/handoffs/<team>/<agent>-<ts>.md` becomes
  `<chat>/<agent>`; it hardcodes `homedir()` and ignores `XDG_DATA_HOME`, unlike the rest.
  Fix in passing or leave; say which.

The answer amends `.scratch/transcript-scale/10` by name.
