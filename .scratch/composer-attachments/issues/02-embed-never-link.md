Type: task
Status: resolved
Blocked by: 01

# Embed, never link

## Problem

Three ways to hand bytes to a runtime. The third only exists because issue 01 decided an
Attachment is part of the Message, so blobot holds a copy of its own.

1. **Embed** — `{type:'image', data:<base64>, mimeType}`, or `{type:'resource', resource:{text}}`
   for a text file. Both runtimes advertise support. Nothing on disk is reachable by anyone; the
   cost is the full payload in the window, per recipient.
2. **Link to the original** — `resource_link` at `file:///home/alain/Downloads/spec.pdf`.
   Near-zero context, and baseline ACP so it works on every runtime including ones with no
   adapter yet.
3. **Link to blobot's own copy** — `file:///…/attachments/<id>.png`.

## Answer

**Embed.** It is the expensive option and the only one where *isolated by AgentWorkspace, not by
convention* survives contact with the feature.

The fact that decides it is in `adapters/claude/permissions.ts:35` — *"`Read`, `Glob` and `Grep`
are absent because Claude never prompts for them."* A path handed to an agent is read with **no
permission gate, at no trust level**. So neither link option can be defended as "the user can
approve it".

Option 3 looks like the clever answer and is the more dangerous one. That directory is stable,
predictable, and holds **every attachment from every team**: hand one agent one link into it and
`Glob` walks the rest. An agent on one team reads a screenshot the user sent another team last
month, with no prompt, and blobot never knows. Option 2 has the same shape aimed at the user's
home directory, and `~/Downloads/spec.pdf` also tells an agent where downloads live.

Case (c) has no path to link at all, so the embedding machinery must exist regardless. Options 2
and 3 are an *optimisation* on top of it, and the thing they optimise away is the isolation
boundary.

## blobot does not resize

A 4K screenshot costs several times the tokens of the same screenshot at 1568px wide and is not
several times more readable. Every serious client downscales. blobot does not.

Silent resizing is indefensible here: an agent reading a downscaled screenshot of a stack trace
and getting the line number wrong is a bug with no visible cause. Resizing *and saying so* is
honest, but it puts an image-processing dependency and a quality judgment into a codebase whose
posture everywhere else is that it does not touch the user's content — it refuses rather than
truncates, it does not compact, it does not summarize. To save tokens in a window it explicitly
does not manage.

If the cost is the problem, the lever is the one issue 01 already chose: show what it costs and
let the user decide.
