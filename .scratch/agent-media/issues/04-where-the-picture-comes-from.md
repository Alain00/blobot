Type: grilling
Status: open
Blocked by: 01, 02

# Where does the picture come from, and does blobot ever take it itself?

## Question

*Send me a screenshot of how my app looks* has at least three mechanisms behind it, and they
differ in who holds the shutter. This is the crux of the map: almost every other ticket is
downstream of it.

1. **A tool result blobot observes.** The agent calls a browser server the operator configured, it
   returns an image block, blobot reads it off `tool_call_update` and draws it. blobot builds
   nothing, vouches for nothing new, and owns nothing. It also controls nothing: the picture
   exists because the operator installed a server, and blobot cannot say when it was taken or of
   what.
2. **A file the agent wrote in its own AgentWorkspace.** The agent runs a screenshot command or a
   Playwright script, a PNG lands in the worktree, and the agent points at it. blobot would read a
   path inside a workspace it already owns, which is the one directory the isolation argument does
   *not* fence off. Cheap, and it drags a path back into a story ADR-0004 spent its length getting
   paths out of.
3. **A tool of blobot's own**, on the loopback server beside `message_agent`, `propose_routine`
   and `record_entry`. The agent asks blobot to show something, and blobot decides what crosses,
   measures it, times it, and frames it. blobot holds the shutter, or at least the envelope.

## What it has to settle

- **Which of the three, or which combination.** They are not exclusive: 1 may be free and worth
  taking regardless, while 3 is the only one that can answer ticket 07 at all. Argue whether the
  cheap one and the good one are the same feature or two.
- **Whether 2 is refused, and on what grounds.** The reflex is that a path inside the agent's own
  workspace is fine, because that is precisely what the workspace is for. Grill it: the path is
  supplied by the agent, blobot would be reading a file chosen by the thing it is supervising, and
  `../` is a string. If it is allowed, the containment check is a decision, not an implementation
  detail.
- **What a blobot tool would actually be for.** *Show the user this* is not a screenshot tool.
  blobot cannot drive a browser, and it must not: that would put a headless browser in a
  local-first desktop app that ships no such thing. So option 3 is an **envelope**, not a camera,
  and the ticket should say so or reject the option.
- **Whether the answer depends on ticket 01's findings.** If a runtime rewrites images into paths
  on the wire, option 1 partly collapses into option 2 and this ticket has to handle it.
- **The honest ceiling on what the objective can deliver.** If the answer is 1, then *sends me back
  screenshots of how my app looks* is true only for a user who has a browser MCP server installed,
  and blobot's part is to stop discarding the result. That is a much smaller feature than the
  sentence implies, and if it is the right one it should be stated in the answer rather than
  discovered by the first person who tries it.

## What is binding

- **blobot is not a browser.** No headless browser, no page driving, no rendering engine beyond the
  Electron window it already is.
- ADR-0003 stands: the operator's own MCP servers load, and blobot does not curate them.
- Nothing here writes into an AgentWorkspace. A file left in a checkout can be committed home.
- If a new loopback tool is proposed, it inherits every rule the existing three have: named
  `blobot`/`<tool>`, the bearer token is the caller's identity, stateless, and every call it makes
  is disclosed in the turn that made it.
