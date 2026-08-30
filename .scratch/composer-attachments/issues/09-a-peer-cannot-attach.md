Type: task
Status: resolved

# A peer cannot attach

## Problem

`message_agent` refuses a body over 4,000 characters, on the grounds that a teammate gets your
summary and not your transcript. Should an agent be able to attach a file to a peer message?

There is a real case for it: Alice runs the app, screenshots the bug, and wants Bob to see it
rather than read a paragraph describing it.

## Answer

**No, and written down as a refusal rather than left open.**

The character bound works precisely because it needs no judgment. Bytes have no equivalent:
blobot provides no inference, so it cannot tell whether an agent's 2 MB attachment is a summary
or a dump, and *"always compact context, never a full context copy"* would be a rule with nothing
enforcing it.

It is not much of a limitation. If Alice needs Bob to see an image, it is in her AgentWorkspace
and she can tell him where — which is case (a) from issue 01, the file-already-in-the-Workspace
case, and one more reason it deserves its own effort rather than being folded into this one.

The refusal is carried in `CONTEXT.md`'s definition of **Attachment** rather than only in code,
so it is read by anyone learning the vocabulary: *only the user attaches; a peer Message never
carries one.*
