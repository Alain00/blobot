Type: task
Status: resolved
Blocked by: 02

# What may be attached, and how big

## Problem

Embedding decides *how*, not *what*. The runtimes' capability flags cover two categories and are
silent about everything else, and nothing in blobot bounds what a user can put into an agent's
window.

## Answer

**Images and text files. Everything else refused by name, at the moment of attaching.**

- **Images** — `image: true` on both runtimes. The driving case, and the one that works.
- **Text-ish files** (`.md`, `.ts`, `.csv`, `.log`, `.json`) — an embedded text resource. The
  ceiling is a character count, which `bounds.ts` already speaks.
- **Everything else** — PDFs, `.docx`, archives, video. Neither runtime advertises anything
  about them. Embedding a PDF as a base64 blob resource is protocol-legal and there is no
  evidence either agent does anything useful with it: it may be **silently ignored**, which is
  the worst outcome available — a chip in the transcript for a file the agent never saw. PDFs
  are the obvious gap and it stays open with a stated reason rather than being closed by sending
  bytes into a runtime that may drop them. Same instinct as ticket 08's refusal of a kind mock.

## Two ceilings, both in `bounds.ts`

They belong beside `PEER_MESSAGE_LIMIT` because they are the same kind of rule — *what blobot is
allowed to put into an agent's context*, which is that file's stated purpose.

- **Text attachments**: a character limit, an order of magnitude above the peer bound (~50,000).
  A file the user attaches is deliberately **not** subject to the peer limit: that limit exists
  to stop agents dumping on each other, and this is the operator speaking with operator
  authority.
- **Images**: a byte limit on the file, in the low megabytes. Two constraints meet here —
  providers stop accepting a single image somewhere around 5 MB, and the transport writes a
  prompt as **one line** (`child.stdin.write(line)` in `child-transport.ts`, return value
  ignored, no backpressure), inflated ~1.33x by base64.

## Refused at attach, never at send

The difference between a rule and a trap. A file is checked when it is picked up, not when the
message is sent, so nobody types a paragraph against a file that was never going to travel.

The refusal names the number and the limit, the way `tooLongToSend` does. **A text file is never
truncated** — half a file with no marker is the exact failure that function was written against.
