import { useState } from 'react';
import { Command, useCommandState } from 'cmdk';
import { ArrowUp } from 'lucide-react';
import { findAgentByName } from '@blobot/core/domain';
import type { Agent } from '@blobot/core/domain';
import type { UiAgent, UiCommand } from '../../../shared/api.js';
import { commandMenu } from '../model.js';
import type { Pane } from '../model.js';
import { Blob } from './Blob.js';

/**
 * The recipient is an `@mention`, not a picker.
 *
 * A picker defaulting to `to Alice ▾` quietly implies a broadcast surface that does not exist:
 * a message lands in exactly one agent's session. So in an agent's pane the recipient is
 * implicit and a mention overrides it (last valid mention wins).
 *
 * **The team pane has an implicit recipient too, and it is the team's lead.** Ticket 12 said it
 * did not, and was reopened on that one point: talking to a team meant naming a member first,
 * and the ask was to say something to a team without deciding who it is for. The reason ticket
 * 12 gave survives and shapes this rather than blocking it — the objection was to a control
 * that *implied a broadcast*, and nothing here broadcasts: the lead receives the message as
 * itself, in one session, exactly as a mention would have delivered it. What the reopen demands
 * in exchange is that the composer **say** who it resolved to, and keep saying it: the send
 * control in the team pane carries the lead's name, and the placeholder says who is being
 * written to before a key is pressed. A team with no lead — one formed before leads
 * existed, or one whose lead has left the roster — is unchanged: send stays disabled until a
 * mention resolves, and nobody is promoted into the job unseen.
 *
 * Resolution goes through `findAgentByName`, the same function the orchestrator validates
 * `message_agent` with: the unresolved-mention state is the human-facing twin of its
 * "no such teammate" error.
 *
 * The send control says who it resolved to only where that is a live question. In an agent's
 * pane the pane *is* the recipient, so `send to Alice` under a transcript of Alice was the
 * third time the screen said Alice; it is an arrow alone. In the team pane it takes the
 * resolved agent's name as well, because there the answer is not on screen anywhere else — and
 * once the recipient can be one nobody typed, the name has to survive the placeholder
 * disappearing on the first keystroke.
 *
 * The suggestion list is `cmdk`, for the half nobody screenshots: arrow keys, one active item
 * that the pointer and the keyboard cannot disagree about, `role="listbox"`/`"option"`, and the
 * id that `aria-activedescendant` needs. Radix has no combobox primitive and never has, which
 * is why this is not one — a combobox keeps focus in the text input while a *virtual* cursor
 * moves, and every Radix menu moves real focus into the menu instead. The palette
 * (`.scratch/command-palette/`) is this same list pointed at `/`, so it is worth the dependency.
 *
 * Two things cmdk does not do, handled below: **Tab** (it has no opinion on it) and **Escape**
 * (only its Dialog does). And its `Command.Input` is not used — it hardcodes `spellCheck={false}`
 * and `aria-expanded={true}` after spreading your props, and this is a prose field that is
 * usually not showing a menu. So the input stays ours and cmdk is told what to handle.
 */
export function Composer({
  agents,
  commands,
  pane,
  lead,
  onSend,
  opening = false,
}: {
  agents: readonly UiAgent[];
  /** Each agent's own slash menu. Per session, so two teammates can offer different ones. */
  commands: Record<string, readonly UiCommand[]>;
  pane: Pane;
  /**
   * The team's lead, when it has one: the team pane's recipient when the user names nobody.
   * Passed rather than read off the pane, because a pane is a place on screen and this is a
   * fact about the team.
   */
  lead?: string;
  onSend: (agentId: string, text: string) => void;
  /**
   * The team is still starting. Sending is closed, because there is no session to send to yet,
   * but the field stays open: a cold start is seconds and the thing the user came to say is
   * worth more than the wait. The draft is still here when the team arrives.
   */
  opening?: boolean;
}): React.JSX.Element {
  const [draft, setDraft] = useState('');
  /** The item the arrow keys are on. cmdk owns it; this mirrors it so Tab can read it. */
  const [active, setActive] = useState('');
  /** Escape closes the menu without clearing what has been typed, until the next keystroke. */
  const [dismissed, setDismissed] = useState(false);
  const roster = agents as unknown as readonly Agent[];

  const mentions = [...draft.matchAll(/@([\w-]+)/g)];
  const resolvedMentions = mentions
    .map((match) => findAgentByName(roster, match[1] ?? ''))
    .filter((agent): agent is Agent => agent !== undefined);
  const implicit = pane.kind === 'agent' ? pane.agentId : lead;
  const recipientId = resolvedMentions.at(-1)?.id ?? implicit;
  const recipient = agents.find((agent) => agent.id === recipientId);

  const partial = /@([\w-]*)$/.exec(draft)?.[1];
  const suggestions =
    partial === undefined || dismissed
      ? []
      : agents.filter((agent) => agent.name.toLowerCase().startsWith(partial.toLowerCase()));

  const offered = recipientId === undefined ? [] : (commands[recipientId] ?? []);
  const { suggestions: commandSuggestions, note } = commandMenu({
    draft,
    dismissed,
    recipientName: recipient?.name,
    offered,
  });

  /**
   * Whether the menu is taking keys. A note is not: nothing in it can be accepted, and Enter
   * has to keep sending. Anything blobot leaves off the list still works when typed, so a
   * message beginning with `/` is a message like any other.
   */
  const open = suggestions.length > 0 || commandSuggestions.length > 0;

  /** Accepting a suggestion leaves a trailing space, which is also what closes the menu. */
  const complete = (agent: UiAgent): void => {
    setDraft(draft.replace(/@[\w-]*$/, `@${agent.name} `));
    setDismissed(false);
  };

  /** The trailing space is where the argument goes, for the commands that take one. */
  const completeCommand = (command: UiCommand): void => {
    setDraft(`/${command.name} `);
    setDismissed(false);
  };

  const accept = (): void => {
    const command = commandSuggestions.find((it) => `cmd:${it.name}` === active);
    if (command !== undefined) return completeCommand(command);
    if (commandSuggestions.length > 0) return completeCommand(commandSuggestions[0] as UiCommand);
    const agent = suggestions.find((it) => it.id === active) ?? suggestions[0];
    if (agent !== undefined) complete(agent);
  };

  /**
   * Who the empty field is about to write to. In an agent's pane the pane already says it, so
   * this is the plain sentence it always was; in the team pane it names the lead and says the
   * mention still overrides, because the recipient there is one the user did not type.
   */
  const placeholder =
    pane.kind === 'agent'
      ? `Message ${recipient?.name ?? ''}`
      : recipient === undefined
        ? 'Message the team. Start with @ to say who'
        : `Message ${recipient.name}. @ to say who else`;

  const send = (): void => {
    const text = draft.trim();
    if (opening || text === '' || recipientId === undefined) return;
    onSend(recipientId, text);
    setDraft('');
  };

  return (
    <div className="composer">
      <div className="pill">
      <Command
        className="mentionwrap"
        label="Teammates and commands"
        value={active}
        onValueChange={setActive}
        /* We filter by the typed prefix ourselves, because the input's value is a whole message
           rather than a search string. */
        shouldFilter={false}
        /* ctrl+n/j/p/k are cmdk's palette bindings. This is a text field, where they belong to
           the platform. */
        vimBindings={false}
        loop
      >
        {(open || note !== undefined) && (
          <Command.List className="suggest">
            {suggestions.map((agent) => (
              <Command.Item key={agent.id} value={agent.id} onSelect={() => complete(agent)}>
                <Blob name={agent.name} size={18} hue={agent.hue} />
                <span>{agent.name}</span>
                <span className="r">{agent.role}</span>
              </Command.Item>
            ))}
            {commandSuggestions.map((command) => (
              <Command.Item
                key={command.name}
                value={`cmd:${command.name}`}
                onSelect={() => completeCommand(command)}
              >
                {/* Monochrome, and mono. A command is not an agent and must not be the second
                    saturated thing on screen, so it wears no blobatar. */}
                <span className="cmd">/{command.name}</span>
                {command.hint !== undefined && <span className="hint">{command.hint}</span>}
                <span className="r">{command.description}</span>
              </Command.Item>
            ))}
            {note !== undefined && <div className="suggestnote">{note}</div>}
          </Command.List>
        )}
        <div className="hl" aria-hidden>
          {draft === '' ? (
            <span className="ph">{placeholder}</span>
          ) : (
            highlight(draft, roster)
          )}
        </div>
        <MentionInput
          draft={draft}
          open={open}
          onChange={(text) => {
            setDraft(text);
            setDismissed(false);
          }}
          onKeyDown={(event) => {
            // cmdk's root handles keys on the way up, and skips the event if it is already
            // default-prevented — so preventing here is how the input claims a key from it.
            if (open) {
              if (event.key === 'Escape') {
                event.preventDefault();
                setDismissed(true);
                return;
              }
              if (event.key === 'Tab') {
                event.preventDefault();
                accept();
                return;
              }
              // Enter and the arrows are cmdk's while the menu is open. Enter in particular:
              // it must accept the suggestion, not send `@al` as the message.
              if (event.key === 'Enter' || event.key === 'ArrowDown' || event.key === 'ArrowUp')
                return;
            }
            if (event.key === 'Enter') {
              event.preventDefault();
              send();
            }
          }}
        />
      </Command>
      <button
        className={`send${pane.kind === 'team' && recipient !== undefined ? ' named' : ''}`}
        disabled={opening || recipientId === undefined || draft.trim() === ''}
        onClick={send}
        title={
          opening
            ? 'The team is still starting'
            : recipient === undefined
              ? 'Say who with @'
              : `Send to ${recipient.name}`
        }
        aria-label={recipient === undefined ? 'Send' : `Send to ${recipient.name}`}
      >
        {/* The name, and never the face. The recipient's blobatar was here, which was the
            recipient identified a fourth time: the pill carries it, the `@mention` you typed
            carries it, and the tooltip carries it. A blobatar on a button also reads as the
            affordance rather than as an identity, which is the one thing a face must never be
            here. The word is what the button is promising, so the word is what it shows. */}
        {pane.kind === 'team' && recipient !== undefined && (
          <span className="to">{recipient.name}</span>
        )}
        <ArrowUp size={16} strokeWidth={2.25} aria-hidden />
      </button>
      </div>
    </div>
  );
}

/**
 * The composer's own input, inside cmdk's tree so it can read which item the arrows are on.
 * `useCommandState` is only readable from a child, which is the only reason this is a component.
 */
function MentionInput({
  draft,
  open,
  onChange,
  onKeyDown,
}: {
  draft: string;
  open: boolean;
  onChange: (text: string) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
}): React.JSX.Element {
  const activeId = useCommandState((state) => state.selectedItemId);
  return (
    <input
      value={draft}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={onKeyDown}
      role="combobox"
      aria-expanded={open}
      aria-activedescendant={open ? activeId : undefined}
    />
  );
}

/** A resolved mention takes ink weight and an underline; an unresolved one stays muted. */
function highlight(draft: string, roster: readonly Agent[]): React.JSX.Element[] {
  const parts = draft.split(/(@[\w-]+)/g);
  return parts.map((part, index) => {
    if (!part.startsWith('@')) return <span key={index}>{part}</span>;
    const resolved = findAgentByName(roster, part.slice(1)) !== undefined;
    return (
      <span key={index} className={resolved ? 'm' : 'm bad'}>
        {part}
      </span>
    );
  });
}
