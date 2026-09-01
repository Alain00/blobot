import { useEffect, useRef, useState } from 'react';
import { Command, useCommandState } from 'cmdk';
import { ArrowUp, Mic, Plus, Square } from 'lucide-react';
import { findAgentByName } from '@blobot/core/domain';
import type { Agent } from '@blobot/core/domain';
import type { UiAgent, UiAttachment, UiCommand, UiUsage } from '../../../shared/api.js';
import { addressedBy, commandMenu, isAddressing } from '../model.js';
import type { Pane } from '../model.js';
import { Blob } from './Blob.js';
import { Attached, sizeOf } from './Attached.js';
import { ContextRing } from './ContextRing.js';

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
  usage,
  lead,
  onSend,
  footer,
  notice,
  suggest,
  opening = false,
  place,
  dictation,
}: {
  agents: readonly UiAgent[];
  /** Each agent's own slash menu. Per session, so two teammates can offer different ones. */
  commands: Record<string, readonly UiCommand[]>;
  pane: Pane;
  /**
   * Every agent's context reading, by agent id. The composer draws the recipient's, and knows
   * nothing about where the number came from — it is the same `usage_updated` the activity
   * column folds, handed to the one other place the answer is worth having.
   */
  usage: Record<string, UiUsage>;
  /**
   * The team's lead, when it has one: the team pane's recipient when the user names nobody.
   * Passed rather than read off the pane, because a pane is a place on screen and this is a
   * fact about the team.
   */
  lead?: string;
  /** Everybody the message is addressed to. One agent unless the user named several. */
  onSend: (agentIds: readonly string[], text: string, attachmentIds: readonly string[]) => void;
  /**
   * What sits in the tray under the field: where this agent's work is, in an agent's pane.
   *
   * A child rather than a sibling, because it is drawn *tucked under the pill* and the two have
   * to be one stacking context for that to work. It is a node and not a status, so the composer
   * still knows nothing about branches or pull requests.
   */
  footer?: React.ReactNode;
  /**
   * A statement about the recipient, above the field: today the Handbook's unbriefed card.
   *
   * Above rather than in the tray below, because the tray's rule is that nothing on it is a
   * description. A node and not a status, like `footer`, so the composer still knows nothing
   * about what it is saying.
   */
  notice?: React.ReactNode;
  /**
   * Words put into the field for the user to finish, and the moment they were offered.
   *
   * The `at` is what makes it fire: the same text offered twice is two offers, and a prop that
   * carried only the string would refill the field on any re-render after the user cleared it.
   * Never a send — the user completes the sentence and presses send themselves, because the
   * whole of `add one` is that `record_entry` stays the single path into a Handbook and the
   * words going to the agent are the user's own.
   */
  suggest?: { readonly text: string; readonly at: number };
  /**
   * The team is still starting. Sending is closed, because there is no session to send to yet,
   * but the field stays open: a cold start is seconds and the thing the user came to say is
   * worth more than the wait. The draft is still here when the team arrives.
   */
  opening?: boolean;
  /**
   * Dictation, when it is enabled and configured — absent otherwise, and then nothing of it is
   * drawn (`.scratch/dictation/`, ticket 07's prototype). The composer knows a state, a level
   * and a partial; it knows nothing about which Transcriber is behind them.
   *
   * `level` is the microphone's RMS, 0..1, measured in the renderer and never crossing IPC.
   * `partial` is text that may still change: it is drawn as a ghost after the caret and never
   * enters the field's value (ticket 06). `committed` text arrives through `suggest`.
   */
  dictation?: DictationView;
  /**
   * A place, named. Whenever it changes the field takes focus, because arriving at a team or at
   * an agent is arriving somewhere you came to say something: the composer is what you are
   * here for, and a click on the rail followed by a click on the field is one click too many.
   *
   * A string rather than the pane, because the team behind the pane counts too — switching
   * teams leaves you in the team pane you were already in, and that is still an arrival.
   */
  place?: string;
}): React.JSX.Element {
  const field = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState('');
  /** The item the arrow keys are on. cmdk owns it; this mirrors it so Tab can read it. */
  const [active, setActive] = useState('');
  /** Escape closes the menu without clearing what has been typed, until the next keystroke. */
  const [dismissed, setDismissed] = useState(false);
  /**
   * What is going with this message. Cleared with the draft, because they are one message: a
   * send that took the words and kept the picture would be the strangest half-state available.
   */
  const [attached, setAttached] = useState<readonly UiAttachment[]>([]);
  /** Why the last file did not travel. Said in the composer, at pickup, never at send. */
  const [refused, setRefused] = useState<string | undefined>(undefined);
  /** A file is over the field. Drawn, because a drop target nobody can see is not one. */
  const [over, setOver] = useState(false);
  /**
   * Where the caret is. Tracked because two things are drawn relative to it and neither is in
   * the textarea: the dictation ghost sits after it in the mirror, and committed text is
   * inserted at it rather than appended (ticket 06).
   */
  const [caret, setCaret] = useState(0);
  /** Where the caret should go once a programmatic insertion has rendered. */
  const caretAfter = useRef<number | undefined>(undefined);
  const roster = agents as unknown as readonly Agent[];

  // Arriving somewhere puts the cursor where the arrival was for. Not on every render — only
  // when the place changes — so it never fights the user for focus while they are working.
  useEffect(() => {
    if (place === undefined) return;
    field.current?.focus();
  }, [place]);

  // Words offered, not sent. Appended to whatever is already there rather than replacing it: a
  // control that silently ate a half-written message would be the worst thing on this screen.
  useEffect(() => {
    if (suggest === undefined) return;
    setDraft((held) => (held === '' ? suggest.text : `${held.replace(/\s*$/, '')}\n${suggest.text}`));
    field.current?.focus();
    // The offer is identified by its moment, so the same words twice are two offers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggest?.at]);

  // Committed dictation lands **at the caret**, spaced as needed, caret after it — so typing
  // while dictating needs no rule of its own (ticket 06). Not `suggest`'s rule: that appends a
  // line for the user to finish, and a spoken sentence continues the one being written.
  useEffect(() => {
    const committed = dictation?.committed;
    if (committed === undefined) return;
    const at = field.current?.selectionStart ?? caret;
    setDraft((held) => {
      const pos = Math.min(at, held.length);
      const before = held.slice(0, pos);
      const after = held.slice(pos);
      const lead = before !== '' && !/\s$/.test(before) ? ' ' : '';
      const trail = after !== '' && !/^\s/.test(after) ? ' ' : '';
      const text = `${lead}${committed.text}${trail}`;
      caretAfter.current = pos + text.length;
      return before + text + after;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dictation?.committed?.at]);

  // The caret follows an insertion once the draft has rendered, which is one render later.
  useEffect(() => {
    const want = caretAfter.current;
    if (want === undefined) return;
    caretAfter.current = undefined;
    const element = field.current;
    if (element === null) return;
    element.setSelectionRange(want, want);
    setCaret(want);
  }, [draft]);

  const addressed = addressedBy(draft, roster);
  const implicit = pane.kind === 'agent' ? pane.agentId : lead;
  /**
   * Everybody this message is going to. More than one only when the user named more than one:
   * blobot never widens the list, so an implicit recipient is always exactly one agent.
   */
  const recipientIds =
    addressed.length > 0
      ? addressed.map((agent) => agent.id)
      : implicit === undefined
        ? []
        : [implicit];
  const recipients = recipientIds
    .map((id) => agents.find((agent) => agent.id === id))
    .filter((agent): agent is UiAgent => agent !== undefined);
  const recipient = recipients[0];

  const partial = /@([\w-]*)$/.exec(draft)?.[1];
  const suggestions =
    partial === undefined || dismissed
      ? []
      : agents.filter((agent) => agent.name.toLowerCase().startsWith(partial.toLowerCase()));

  // One menu, and it is the first recipient's. Two agents can offer different commands, and
  // there is no honest way to draw a list that is true of both — so the menu belongs to the
  // agent the message is addressed to first, and a command nobody offers still sends as text.
  const offered = recipient === undefined ? [] : (commands[recipient.id] ?? []);
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

  /**
   * What the addressed agents will take.
   *
   * The intersection, not the union: a fan-out is refused whole rather than delivered to two of
   * three, because blobot never narrows a set the user typed. With nobody addressed yet it is
   * the first agent's answer, so the paperclip is not dead in an empty team pane.
   */
  const takers = recipients.length > 0 ? recipients : agents.slice(0, 1);
  const canAttach = {
    images: takers.length > 0 && takers.every((agent) => agent.accepts.images),
    textFiles: takers.length > 0 && takers.every((agent) => agent.accepts.textFiles),
  };

  /** One pickup, from any of the three doors. A refusal is an answer, and it is said here. */
  const keep = (picked: UiAttachment | { error: string } | undefined): void => {
    if (picked === undefined) return;
    if ('error' in picked) return setRefused(picked.error);
    const kind = picked.kind === 'image' ? canAttach.images : canAttach.textFiles;
    if (!kind) {
      const refuser = takers.find((agent) =>
        picked.kind === 'image' ? !agent.accepts.images : !agent.accepts.textFiles,
      );
      return setRefused(
        picked.kind === 'image'
          ? `${refuser?.name ?? 'this agent'} runs on a runtime that does not take images.`
          : `${refuser?.name ?? 'this agent'} runs on a runtime that does not take text files.`,
      );
    }
    setRefused(undefined);
    setAttached((held) => [...held, picked]);
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

  /**
   * The recipients, short enough for a button. Two names and a count past that: a list that
   * grows with the roster stops being readable at the width a send control has, and `3 agents`
   * would answer "who is this going to" with a number, which is the register ticket 12 removed.
   * The field itself carries the full answer, underlined, a few pixels to the left.
   */
  const addressLabel = recipients
    .slice(0, 2)
    .map((agent) => agent.name)
    .join(', ')
    .concat(recipients.length > 2 ? ` +${recipients.length - 2}` : '');
  const addressSentence = recipients.map((agent) => agent.name).join(', ');

  const send = (): void => {
    const text = draft.trim();
    if (opening || recipients.length === 0 || text === '') return;
    onSend(recipientIds, text, attached.map((one) => one.id));
    setDraft('');
    // One message, one lifetime. Keeping the picture after taking the words would be the
    // strangest half-state available.
    setAttached([]);
    setRefused(undefined);
  };

  /**
   * Words in the field and nowhere to send them.
   *
   * The team pane says who it resolved to in the placeholder, and the placeholder is gone by the
   * second keystroke — so a team with no lead used to answer a typed message with a disabled
   * arrow and a tooltip, which reads as broken rather than as unaddressed. Found by the author
   * on the first real team, which had no lead because it predates them.
   *
   * It names both exits, and neither of them is blobot choosing a recipient: address it, or give
   * the team a lead. Suppressed while the mention menu is up, because that is the user already
   * doing the first one.
   */
  const stranded = pane.kind === 'team' && recipients.length === 0 && draft.trim() !== '' && !open;

  /** The ghost, if there is one: where it goes and what it says, spaced against its neighbours. */
  const ghost =
    dictation?.state === 'listening' && dictation.partial !== undefined
      ? spacedGhost(draft, ghostPosition(draft, caret), dictation.partial)
      : undefined;

  /**
   * A drop, from the OS. Electron 44 removed `File.path` (gone since 32), so a path comes from
   * the preload's `webUtils` or it does not come at all — and the renderer never reads a file
   * either way: the path goes to main, and main is where the size and the kind are decided.
   */
  const drop = (event: React.DragEvent): void => {
    event.preventDefault();
    setOver(false);
    for (const file of Array.from(event.dataTransfer.files)) {
      const path = window.blobot.pathOf(file);
      if (path === undefined) continue;
      void window.blobot.attachPath(path).then(keep);
    }
  };

  /**
   * A paste. The one door with no path and no filename, which is the case that started this.
   *
   * Only when the clipboard actually carries a file: a plain text paste is a paste into a text
   * field and must stay one, so this does not prevent the default unless it takes the event.
   */
  const paste = (event: React.ClipboardEvent): void => {
    const files = Array.from(event.clipboardData.files);
    if (files.length === 0) return;
    event.preventDefault();
    for (const file of files) {
      void file
        .arrayBuffer()
        .then((buffer) =>
          window.blobot.attachBytes(
            new Uint8Array(buffer),
            file.type,
            // A pasted screenshot's `name` is empty, and it is left empty rather than invented.
            file.name === '' ? undefined : file.name,
          ),
        )
        .then(keep);
    }
  };

  return (
    <div
      className={`composer${over ? ' over' : ''}`}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
    >
      {notice}
      {refused !== undefined && <div className="stranded">{refused}</div>}
      {attached.length > 0 && (
        <div className="attached">
          {attached.map((one) => (
            <Attached
              key={one.id}
              attachment={one}
              onRemove={() => setAttached((held) => held.filter((it) => it.id !== one.id))}
            />
          ))}
          {/* What this send will cost, before it is made. blobot delivers to everybody the user
              addressed and never narrows that set, so the multiplication is the user's to see
              and the user's to decide about — it is not blobot's to manage. */}
          <span className="cost">
            {recipients.length > 1
              ? `${sizeOf(attachedBytes(attached))} to each of ${recipients.length}`
              : sizeOf(attachedBytes(attached))}
          </span>
        </div>
      )}
      {stranded && (
        <div className="stranded">say who with @ · or give this team a lead</div>
      )}
      {/* The word. Above the pill in the line the composer already uses to speak about the
          field, mono like every status word, with the clock beside it because a recording has a
          ceiling and the figure is what says how far from it you are. */}
      {dictation?.state === 'listening' && (
        <div className="stranded speech">
          listening · {clock(dictation.seconds)}
          {/* Backpressure: the engine is behind and audio is being dropped rather than queued
              (ticket 04). Said, because a gap in the text with no cause reads as the user's
              fault. */}
          {dictation.paused ? ' · paused' : ''}
        </div>
      )}
      {/* After a recording: why it stopped, when the reason was not the user. `stopped · 5 min`
          at the ceiling, or the failure by cause — never by provider. */}
      {dictation?.state === 'ready' && dictation.note !== undefined && (
        <div className="stranded speech">{dictation.note}</div>
      )}
      <div className="pill">
      {/* The discoverable door. Paste is the one that gets used and a drop is nearly free, but
          neither is visible, and a feature nobody can find is not one.

          **A plus, not a paperclip.** A paperclip names the file; a plus names the gesture, and
          at the head of the field it is the one glyph that reads as *add something to this
          message* without claiming what. The label and the tooltip still say attach a file,
          because that is all it does today.

          **At the head of the pill, before the field.** It sat at the tail beside send, where
          two round buttons of the same size shared a corner and the second one read as a lesser
          send. The two are not the same kind of thing: one adds to the message, one sends it,
          and putting them at opposite ends of the field is the cheapest way to say so. It is
          also the order the sentence is written in — attach, write, send. */}
      <button
        className="clip"
        disabled={opening || (!canAttach.images && !canAttach.textFiles)}
        onClick={() => void window.blobot.chooseAttachment().then(keep)}
        title={
          canAttach.images || canAttach.textFiles
            ? 'Attach a file'
            : 'This agent takes no attachments'
        }
        aria-label="Attach a file"
      >
        <Plus size={18} aria-hidden />
      </button>
      {/* The microphone, at the head beside `+`, because it is the same kind of thing: a door
          that adds to the message. At the tail it would share a corner with send and read as a
          lesser send — *send my voice* — which it is not; nothing here sends. The glyph swaps,
          `Mic` to `Square`, with nothing between (no morph: DESIGN.md `:527` stands). */}
      {dictation !== undefined && (
        <button
          className={`mic${dictation.state === 'listening' ? ' on' : ''}`}
          disabled={opening}
          onClick={dictation.onToggle}
          title={dictation.state === 'listening' ? `Stop listening · ${SHORTCUT}` : `Dictate · ${SHORTCUT}`}
          aria-label={dictation.state === 'listening' ? 'Stop listening' : 'Dictate'}
          aria-pressed={dictation.state === 'listening'}
        >
          {dictation.state === 'listening' ? (
            <Square size={13} fill="currentColor" aria-hidden />
          ) : (
            <Mic size={17} aria-hidden />
          )}
        </button>
      )}
      {/* The wave: four bars driven by the level of the user's own voice, present only between
          their two gestures. `transform` only, monochrome, and it means one thing — *this is
          reaching me* — which no word in the composer says, so it repeats nothing. */}
      {dictation?.state === 'listening' && <Wave read={dictation.level} />}
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
        {/* The field grows with the words. The highlight layer is the one in the flow, so its
            wrapped height is the field's height, and the textarea lies over it at exactly that
            size — no measuring, no resize observer, nothing to fall out of step. Past six lines
            this box scrolls and they scroll together, because they are both inside it. */}
        <div className="scroll">
        <div className="mirror">
        <div className="hl" aria-hidden>
          {/* The partial: what the Transcriber thinks you are saying, until it is sure. Ghost
              ink after the caret, replaced in place on each revision, gone when its committed
              text lands in the field. It lives in the mirror and never in the textarea, which
              is what keeps the caret and the draft the user's. */}
          {draft === '' ? (
            ghost === undefined ? (
              <span className="ph">{placeholder}</span>
            ) : (
              <span className="ghost">{ghost.text}</span>
            )
          ) : (
            highlight(draft, roster, ghost)
          )}
          {/* A line ending in a newline has no line box of its own to be tall. This gives it
              one, so the caret on the empty last line is over text and not over the border. */}
          {'\u200b'}
        </div>
        <MentionInput
          ref={field}
          draft={draft}
          open={open}
          onPaste={paste}
          onChange={(text, at) => {
            setDraft(text);
            setCaret(at);
            setDismissed(false);
          }}
          onSelect={setCaret}
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
            // Enter sends, shift+Enter opens a line. The field is prose and a paragraph of it
            // is an ordinary thing to write, but Enter is the send this app has always had.
            //
            // The two keys leave by different doors. Send *prevents*, which is how the input
            // claims a key from cmdk. A new line has to be left to the browser instead, and
            // cmdk's root takes Enter whether or not shift is down and whether or not a menu is
            // showing — so this one *stops* rather than prevents: cmdk never sees the event, and
            // the textarea does what a textarea does. Preventing here typed `first linesecond
            // line`, found with real key events through the running app.
            if (event.key === 'Enter') {
              if (event.shiftKey) {
                event.stopPropagation();
                return;
              }
              event.preventDefault();
              send();
            }
          }}
        />
        </div>
        </div>
      </Command>
      {/* Where the paperclip was, and it is the reading rather than a control: what stands
          beside send is what the message is about to cost the window it is going into. */}
      <ContextRing recipients={recipients} usage={usage} />
      <button
        className={`send${pane.kind === 'team' && recipient !== undefined ? ' named' : ''}`}
        disabled={opening || recipients.length === 0 || draft.trim() === ''}
        onClick={send}
        title={
          opening
            ? 'The team is still starting'
            : recipient === undefined
              ? 'Say who with @'
              : `Send to ${addressSentence}`
        }
        aria-label={recipient === undefined ? 'Send' : `Send to ${addressSentence}`}
      >
        {/* The name, and never the face. The recipient's blobatar was here, which was the
            recipient identified a fourth time: the pill carries it, the `@mention` you typed
            carries it, and the tooltip carries it. A blobatar on a button also reads as the
            affordance rather than as an identity, which is the one thing a face must never be
            here. The word is what the button is promising, so the word is what it shows. */}
        {pane.kind === 'team' && recipient !== undefined && (
          <span className="to">{addressLabel}</span>
        )}
        <ArrowUp size={16} strokeWidth={2.25} aria-hidden />
      </button>
      </div>
      {footer}
    </div>
  );
}

/** What the composer is told about dictation. A view, not the Transcriber. */
export interface DictationView {
  readonly state: 'ready' | 'listening';
  /**
   * Microphone level, 0..1, read rather than passed: it changes sixty times a second and the
   * wave is the only thing that wants it, so it never becomes a render of the whole composer.
   */
  readonly level: () => number;
  /** Seconds since listening began. */
  readonly seconds: number;
  /** Audio is being dropped because the engine is behind (ticket 04's backpressure). */
  readonly paused?: boolean;
  /** Text that may still be revised. */
  readonly partial?: string;
  /**
   * Text that will not be revised, and the moment it arrived. The moment is what makes it
   * fire, as with `suggest`: the same words twice are two sentences.
   */
  readonly committed?: { readonly text: string; readonly at: number };
  /** Why the last recording ended, when the reason was not the user. Drawn once it is over. */
  readonly note?: string;
  onToggle: () => void;
}

/** The keyboard gesture, said the way the platform says it. */
const SHORTCUT = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘⇧M' : 'ctrl+shift+M';

/**
 * Where the ghost goes: at the caret, except that a caret inside an `@mention` puts it after
 * the mention, because half a name underlined is not a thing.
 */
function ghostPosition(draft: string, caret: number): number {
  const at = Math.min(caret, draft.length);
  for (const match of draft.matchAll(/@[\w-]+/g)) {
    const start = match.index;
    const end = start + match[0].length;
    if (at > start && at < end) return end;
  }
  return at;
}

/**
 * The ghost with the spaces it needs: one before it when the text before the caret does not
 * end in one, one after it when the text after the caret does not start with one.
 */
function spacedGhost(draft: string, at: number, text: string): { at: number; text: string } {
  const lead = at > 0 && !/\s$/.test(draft.slice(0, at)) ? ' ' : '';
  const trail = at < draft.length && !/^\s/.test(draft.slice(at)) ? ' ' : '';
  return { at, text: `${lead}${text}${trail}` };
}

function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/**
 * Four bars, each a fraction of the level so a single figure reads as a shape. The bar's
 * `transform` is the only thing that changes, and it is set from the level on every frame the
 * level changes — there is no keyframe loop, so when the voice stops the bars stop, and when
 * the recording stops they are gone. Under `prefers-reduced-motion` the bars do not move at
 * all; the word above the pill carries the state alone.
 */
export function Wave({ read }: { read: () => number }): React.JSX.Element {
  const spread = [0.55, 1, 0.75, 0.4];
  const bars = useRef<(HTMLElement | null)[]>([]);
  // The bars are driven straight from the level on each frame, with no state between: a level
  // is not something the composer needs to re-render for. Speaking measures 0.04–0.07 RMS
  // (ticket 04), so the gain brings a normal voice to full height.
  useEffect(() => {
    let frame = 0;
    const tick = (): void => {
      const level = read();
      bars.current.forEach((bar, i) => {
        if (bar !== null)
          bar.style.transform = `scaleY(${Math.max(0.12, Math.min(1, level * 16 * (spread[i] ?? 1)))})`;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [read]);
  return (
    <span className="wave" aria-hidden>
      {spread.map((_k, i) => (
        <i
          key={i}
          ref={(element) => {
            bars.current[i] = element;
          }}
          style={{ transform: 'scaleY(0.12)' }}
        />
      ))}
    </span>
  );
}

/** What one send puts into one agent's window. Per recipient, which is what the label says. */
function attachedBytes(attached: readonly UiAttachment[]): number {
  return attached.reduce((total, one) => total + one.bytes, 0);
}

/**
 * The composer's own field, inside cmdk's tree so it can read which item the arrows are on.
 * `useCommandState` is only readable from a child, which is the only reason this is a component.
 *
 * A textarea rather than an input, because a message to an agent is a paragraph often enough:
 * an input cannot wrap, so a long prompt scrolled sideways out of sight while it was written.
 * It carries no height of its own — the highlight layer under it is what has the height.
 */
function MentionInput({
  draft,
  open,
  onChange,
  onSelect,
  onKeyDown,
  onPaste,
  ref,
}: {
  draft: string;
  open: boolean;
  /** The text, and where the caret is after the change. */
  onChange: (text: string, caret: number) => void;
  /** The caret moved without the text changing: a click, an arrow, a shift-select. */
  onSelect: (caret: number) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onPaste: (event: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  /** The field itself, for the one caller that has to put the cursor in it. */
  ref?: React.Ref<HTMLTextAreaElement>;
}): React.JSX.Element {
  const activeId = useCommandState((state) => state.selectedItemId);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={draft}
      onChange={(event) => onChange(event.target.value, event.target.selectionStart)}
      onSelect={(event) => onSelect(event.currentTarget.selectionStart)}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      role="combobox"
      aria-expanded={open}
      aria-activedescendant={open ? activeId : undefined}
    />
  );
}

/**
 * Three states, because there are three: **addressing** (ink, underlined — this is going to
 * them), **naming** (ink, no underline — a teammate talked about rather than written to), and
 * **unresolved** (muted). The underline is the message's To: line, so it must not appear over
 * `ask @bob about @alice's branch`'s second name, which nothing is being sent to.
 */
function highlight(
  draft: string,
  roster: readonly Agent[],
  ghost?: { readonly at: number; readonly text: string },
): React.JSX.Element[] {
  const parts = draft.split(/(@[\w-]+)/g);
  let offset = 0;
  let placed = false;
  return parts.flatMap((part, index) => {
    const at = offset;
    offset += part.length;
    const mention = part.startsWith('@');
    const resolved = mention && findAgentByName(roster, part.slice(1)) !== undefined;
    const className = !mention ? undefined : !resolved ? 'm bad' : isAddressing(draft, at) ? 'm' : 'm ref';
    // The ghost goes inside the first part that reaches its position, which `ghostPosition`
    // has already kept out of the middle of a mention.
    if (ghost !== undefined && !placed && ghost.at <= at + part.length) {
      placed = true;
      const cut = Math.max(0, ghost.at - at);
      return [
        <span key={`${index}a`} className={className}>
          {part.slice(0, cut)}
        </span>,
        <span key={`${index}g`} className="ghost">
          {ghost.text}
        </span>,
        <span key={`${index}b`} className={className}>
          {part.slice(cut)}
        </span>,
      ];
    }
    return [
      <span key={index} className={className}>
        {part}
      </span>,
    ];
  });
}
