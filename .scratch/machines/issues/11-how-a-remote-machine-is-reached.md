Type: grilling
Status: resolved
Blocked by: 01

# How a remote Machine is reached, without blobot holding a credential

## Question

**No credential storage** is a permanent rule with exactly one conscious exception, drawn
narrowly on ADR-0005 for the dictation Transcriber's key and explicitly not extending. A remote
Machine needs to be reached, and reaching it needs a credential.

The precedent is good and it is already in the app twice: **`gh` is the user's own login,
spawned** — no token stored, no credential proxied, no API called by blobot — and
`detect/remedies.ts` spawns `claude auth login` on a pty where blobot reads no keystrokes. The
same answer is available here: **blobot spawns `ssh <host>` and the user's own ssh config, agent
and keys do the work.** blobot holds a hostname, which is not a credential.

## What to decide

- **Whether a hostname is all that is stored**, and whether that survives contact. A `Host` alias
  from the user's own `~/.ssh/config` is the cleanest possible answer and is worth reaching for
  deliberately: blobot stores an alias, the user owns everything behind it.
- **What happens when the key is passphrase-protected and no agent is running.** The pty
  precedent covers it, and it means a Machine can prompt for something blobot must not see.
- **What is *not* ssh.** A container on this machine needs no credential at all. A VM might. If
  the answer differs per kind, the kinds are what carry it, not one mechanism.
- **The environment strip.** `adapters/acp/child-env.ts` strips the dictation keys from every
  runtime's environment. Whatever travels to a remote Machine goes through a *second* boundary
  nobody has audited: what does blobot send over that connection, and is the strip still applied
  on the far side where the child is actually spawned?
- **Whether a Machine is verified before it is offered.** A hostname the user typed that does not
  resolve, a box with no runtime on it, a box that is up but full. The four detection words are
  `08`'s; whether the Machine *itself* has a state is this one's.

## The rule this must not bend

blobot never provides infrastructure. The user brings the box, the same way the user brings the
CLI and the login. If a design here starts to require blobot to run, host, provision or pay for
anything, it has left the product.

## Closed, 2026-09-04 — out of scope

The author narrowed the destination to **this computer**: the kinds decided here are `local` and
`box`. A Machine of the user's own over ssh is a later effort, not a resumption of this one. What
this ticket had already established is kept as a constraint on ticket `14`'s interface: blobot
stores a hostname and never a credential; the transport is the user's own `ssh`, spawned; the
mailbox rides a reverse forward (`research/03` (d)); and the Machine is a `spawn` provider, so
`ssh <box> ...` is one implementation of the same seam `sbx exec -i` implements.
