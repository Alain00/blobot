Type: task
Status: resolved
Blocked by: 01, 02

# Where the bytes live

## Problem

Issue 01 made an Attachment part of the Message, so it persists. Issue 02 removed the reason to
have a filesystem path at all — nothing links to it now.

1. **A blob in SQLite**, in an `attachments` table referenced by the Message rows.
2. **A file under `userData/attachments/`** with a row pointing at it.

## Answer

**A blob in SQLite**, stored **once per attachment** and referenced by every Message row of a
fan-out. One thing was attached once; three rows point at one blob.

It is unreachable by any agent, it is backed up with the one file the app already has, and there
is no orphan-file state to reconcile at launch. The launch reconcile exists because AgentWorkspaces can go missing; adding a second
thing that can go missing, for bytes nobody outside blobot should be able to reach, buys a
smaller `.db` file and nothing else.

The team-icon precedent chose inline for the same reasons — a file "lives in a folder the user
can move, rename or delete", an asset directory has "its own lifecycle to get wrong". That
argument is weaker here only because the payloads are larger, and issue 03's ceilings bound how
much larger.

## Two consequences, stated rather than discovered

**Attachments are kept forever, because transcripts are.** Corrected while building, 2026-08-30:
deleting a team does not delete its messages. `SqliteStore` **tombstones** the team row
(`sqlite-store.ts:169`, `deletedAt` plus a renamed `name` to release the unique constraint) and
the transcript stays, which is the documented behaviour — *"reports what was kept, releases the
name, and keeps the transcript"*. So an attachment outlives the team it was sent to, and nothing
in the app removes one. That is not a bug and it does not change the decision above — a file on
disk would be kept just as long — but it does mean the store only grows, bounded by issue 03's
ceilings and by how often a person attaches something. If that ever needs an answer, the answer
is a transcript retention policy, which is a decision about messages and not about bytes.

**The delete-a-team price does not change.** `recovers about 3.1 GB · alice 2.9 GB · bob 180 MB`
answers "what does ticking this box destroy", and attachments are destroyed either way — they
come off with the team's rows whether or not the clean tick is set. Adding them to the figure
would attribute to a choice something that is not one. Doubly so now: the attachments are not
destroyed at all.
