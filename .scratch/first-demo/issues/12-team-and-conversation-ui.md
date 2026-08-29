Type: prototype
Status: open
Blocked by: 09

# The team and conversation UI

## Question

The demo's whole payoff is visual: two blobatars working at once, and a visible message
passing between them. That either reads instantly or the demo is flat.

Prototype the team view and the conversation panel to answer: how a team of agents is laid
out and how status is expressed at a glance; how an agent-to-agent message is rendered so it
is obviously *not* a user message; whether there is one conversation per agent, one per team,
or both; and where the activity feed sits relative to the conversation.

Rough and throwaway. React to it, do not polish it. No provider-specific logic anywhere in it.

## Design direction (from the author, recorded while charting)

The visual language is **blobatar.dev's** — Swedish editorial minimalism. Source of truth:
`~/Projects/personal/blobatar/apps/site/styles.css`, which is heavily commented and worth
reading before prototyping.

**The governing rule:** *the blobatars are the only saturated thing on the page.* Everything
else is monochrome. This is load-bearing for us — agent identity and agent status are the two
things that must pop, and the palette already reserves colour for exactly the first of them.
Status therefore cannot be expressed as colour without breaking the rule, which is a real
constraint on the prototype rather than a stylistic preference.

**Tokens** (Tailwind v4 `@theme`, dark-only — `color-scheme: dark`, no light variant):

| Token | Value | Role |
|---|---|---|
| `--color-ground` | `#0a0a0b` | page. Near-black, **not** `#000` — against true black the blobatar silhouettes read as cut out; against this they read as placed |
| `--color-raised` | `#131315` | cards, panels |
| `--color-ink` | `#fafaf8` | text |
| `--color-muted` | `#8a8a93` | secondary text |
| `--color-line` | `#232327` | borders |

**Type:** Geist (sans), Geist Mono, Caveat (hand — used sparingly, one voice, subset to a
single heading).

**shadcn:** the site defines shadcn colour aliases pointing at the five tokens, but only so the
showcase can render registry items unmodified. The site's own vocabulary is
`ground`/`raised`/`ink`/`muted`/`line`, and blobot should use that vocabulary too. Note the one
collision documented there: `muted` here is a *text* colour, whereas shadcn's `muted` is a
surface.

A screenshot of the site is available from the author on request.
