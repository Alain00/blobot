Type: task
Status: resolved

# Provider is a config option, and it is account-wide

## Problem

`writeNewSessionResponse` (`src/acp/sessions.zig`) advertises three config options on
`session/new`: **provider**, model, and mode. ADR-0002's rule is that each adapter hands the UI
the option groups its runtime advertises, minus the ones blobot decides itself, and the renderer
shows them without knowing what they mean. Applied literally, an fx agent's hire dialog would
offer a provider dropdown.

Provider is not like model. fx reaches models through **one provider at a time** -- Vercel AI
Gateway, Codex, or Grok -- each with its own credential and its own model catalog. Naming a
provider without a saved session for it starts that provider's browser sign-in. So a dropdown
that looks like *which model shall this agent use* may open a browser, change which subscription
the user is spending, and change what every other fx agent can see in its catalog.

Mode is also advertised, and blobot decides mode itself: it is ticket 14's posture, translated
from `trust` in ticket 02. Advertising it to the user would let them go around that.

## What to do

Decide which of the three advertised options blobot passes through and which it subtracts, and
write the reason next to the code the way `adapters/claude` does.

The expected answer is **model only**: subtract mode, because trust owns it, and subtract
provider, because it is an account-level choice with a browser flow attached and per-agent is a
lie about its scope. If provider should be choosable at all it belongs somewhere that admits
what it is, not in a per-agent dialog next to a model dropdown.

Two things to check while there:

- Whether `fx acp` really refuses to initialize without an AI Gateway credential, as the ACP page
  says, or whether a Codex or Grok session is enough. If Gateway is genuinely required for ACP,
  ticket 11's probe for fx has to say so, and the readiness word for "signed in to Codex only"
  needs to be one of the four honest states rather than a fifth.
- `fx acp --model <id>` is a process-level override that takes precedence over the model stored
  in a loaded session. That may be a cleaner place to apply the user's choice than
  `session/set_config_option`, given the adapter already spawns one process per agent. Compare
  the two and pick, since on Claude `_meta.claudeCode.options.model` turned out to be accepted
  and ignored, and that lesson is what ADR-0002's amendment is about.


## Answer

**Measured 2026-08-31.** The ticket's title is half wrong, and the half that is right is sharper
than it was charted.

**The choice is per session. The login is account-wide.** `provider` is a real
`session/set_config_option` with three values (`gateway`, `codex`, `grok`), and setting it is
accepted as a request and then refused on the credential:

    {"code": -32600, "message": "fx needs a Codex subscription login for this model.
     Run fx login codex."}

So blobot can offer the provider per agent, exactly as ADR-0002 says the model and the effort are
the user's to choose. What blobot cannot do is *acquire* the login per agent, and it must not: that
is the no-credential-storage rule, and `fx login codex` is the user's own command, spawned in a PTY
by `detect/remedies.ts` the way `claude auth login` already is.

**`model` is per session and independent of `provider`.** Setting `anthropic/claude-sonnet-4.5`
applied while `provider` stayed `gateway`. 234 models are advertised. blobot passes the list
through as ADR-0002's option group and decides none of it.

**The refusal is a good sentence and blobot should quote it.** It names the exact remedy. Composing
our own would be worse and would go stale when fx adds a fourth provider.

**A fifth state that ticket 11 cannot see.** `fx status --json` reported `auth: "fx login"` --
signed in, credential refreshable -- and the turn still failed:

    HTTP 502: {"error":{"message":"A positive credit balance is required for all requests,
     including BYOK, so fallback providers remain available.","type":"insufficient_funds"}}

**Signed in is not the same as able to run**, and no probe blobot can afford will tell them apart,
because the only thing that distinguishes them is a billed request. This is not an fx quirk to work
around; it is the reason ticket 11's states were always described as honest rather than complete,
and it is a second argument for the rule that detection gates nothing. The place it surfaces is the
transcript, on the turn that failed, in fx's own words.
