import { useEffect, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Command } from 'cmdk';
import {
  Check,
  ChevronDown,
  Folder,
  GitBranch,
  GitCommitHorizontal,
  GitPullRequest,
  Plus,
  RefreshCw,
} from 'lucide-react';
import type {
  UiAgent,
  UiBranch,
  UiBranches,
  UiChurn,
  UiPublishResult,
  UiWorkspaceStatus,
} from '../../../shared/api.js';
import { Blob } from './Blob.js';

/**
 * Where an agent's work is, and whether GitHub has it yet.
 *
 * Two questions the app could not answer without a terminal. It is **observation**, in the same
 * sense the context gauge is observation: no agent is told any of this, nothing here enters a
 * session, and the only thing on it that acts is a button a person presses.
 *
 * It is drawn in two places because the honest sentence differs by pane. **An agent's pane has
 * one branch**, so it goes under the composer, where the screenshot this came from puts it and
 * where the eye already is. **A team has N branches**, one per member, so in the team pane it is
 * a block in the activity column beside `CONTEXT` — one branch name under a team composer would
 * be a false statement about the other members.
 *
 * Monochrome and mono throughout, including the pull request's state. DESIGN.md's governing
 * rule has one yield in it and this is not it: a green *merged* badge would be the second
 * saturated thing on screen, and the blobatars are the only saturated thing on screen.
 */

/**
 * The tray tucked under an agent's composer: what is uncommitted here, and where it goes.
 *
 * Inset and half-hidden behind the pill rather than floating below it as a line of type, which
 * is what it was: a sentence under the composer read as another thing on the page, and this is
 * not another thing — it is the field's own footing. It is a child of the composer for the same
 * reason, since the overlap needs one stacking context.
 *
 * **Everything on it is a live number or a door, and nothing on it is a description.** That is
 * the rule that decided what came off. `checkout` was constant under an agent's own composer,
 * and `3 changed` was a count of touched files, which says nothing about whether there is an
 * afternoon in there. What replaced them is `+412 −7`, which is the figure a person actually
 * decides on, standing next to the control that acts on it.
 *
 * **Two slots, and each is a stage of the same work.** Left is what is in the folder and the
 * commit that would take it. Right is where it goes: the pull request, or the offer to open one,
 * and the branch. Left to right is the order the work moves in, which is why they are pushed
 * apart rather than centred.
 *
 * **Nothing here is boxed.** Every control on this row is type with a chevron or a word, and a
 * hover ground under it. A tray of bordered pills sitting a few pixels under the composer's own
 * border read as controls inside a control; the row is a line of facts, some of which are also
 * doors, and it should look like the facts until you go near one.
 */
export function WorkspaceLine({
  status,
  teamId,
  busy,
  onSwitched,
  onOpenChanges,
  onPublish,
  onPlan,
  door,
}: {
  status: UiWorkspaceStatus | undefined;
  teamId: string | undefined;
  /** This agent is mid-turn. A commit taken now would capture a file half-written. */
  busy: boolean;
  /** The switch changed what is in the folder, so everything read from it is now stale. */
  onSwitched: () => void;
  /**
   * Open the git panel, which is where committing lives now.
   *
   * The tray had a commit popover of its own until the sidebar grew a panel that can commit a
   * *subset*. Two surfaces for one act, one of them able to do less, is the duplication
   * `DESIGN.md` has refused three times, so this became the **door** to the other. The figure
   * stays here, because the figure is a fact about the workspace and the tray is the line of
   * facts.
   */
  onOpenChanges: () => void;
  onPublish: (options: { title?: string; draft?: boolean }) => Promise<UiPublishResult>;
  onPlan: (options: { title?: string; draft?: boolean }) => Promise<readonly string[]>;
  /**
   * A way in to something that is not a workspace fact, on the right of the tray: today the
   * Handbook's `handbook · 4`.
   *
   * A node rather than a status, so this file still knows nothing about Handbooks — the same
   * arrangement the composer has with this whole tray. It is the only thing here that may be a
   * door to prose, and it is allowed because it *is* a door: the tray's rule is that everything
   * on it is a live number or a door and nothing on it is a description.
   */
  door?: React.ReactNode;
}): React.JSX.Element | null {
  // The workspace half is missing on a `plain` Workspace, which is a copy with no branch, and
  // whenever blobot could not look. The tray still draws if something else has a door on it: a
  // Handbook is per `<team>/<agent>` and has nothing to do with whether git can hold the folder,
  // so hiding it because there is no branch would be one feature's absence deciding another's.
  if (status === undefined || status.branch === undefined || teamId === undefined) {
    if (door === undefined) return null;
    return (
      <div className="wsline">
        <div className="wstray">
          <span className="wsdest">{door}</span>
        </div>
      </div>
    );
  }
  return (
    <div className="wsline">
      <div className="wstray">
        <span className="wsplace">
          <Churn churn={status.churn} />
          {status.churn !== undefined &&
            (status.churn.added > 0 || status.churn.removed > 0) && (
              <button
                type="button"
                className="wsflat"
                onClick={onOpenChanges}
                title={busy ? 'this agent is working' : 'what has changed, and committing it'}
              >
                <GitCommitHorizontal size={11} aria-hidden />
                commit
              </button>
            )}
        </span>
        <span className="wsdest">
          {/* One slot, two things that can never both be true: a pull request that exists, or
              the offer to open one. A row carrying both would be saying the work is already
              somewhere and also that it is nowhere. */}
          {status.pr !== undefined ? (
            <button
              type="button"
              className="wsflat"
              onClick={() => void window.blobot.openLink(status.pr?.url ?? '')}
              title={status.pr.title}
            >
              <GitPullRequest size={11} aria-hidden />#{status.pr.number}
              {status.pr.state === 'open' ? '' : ` ${status.pr.state}`}
            </button>
          ) : (
            canPublish(status) && <PublishButton onPublish={onPublish} onPlan={onPlan} />
          )}
          <BranchPicker
            teamId={teamId}
            agentId={status.agentId}
            branch={status.branch}
            onSwitched={onSwitched}
          />
          {/* Last, past the branch, because left to right on this row is the order the work
              moves in and a Handbook is not a stage of it. No separator: nothing else on this
              row carries one, and the gap is what holds these apart. */}
          {door}
        </span>
      </div>
    </div>
  );
}

/**
 * What is uncommitted here, in lines.
 *
 * Two numbers and no word, because the two signs are the word: nobody needs to be told that the
 * one after the plus was added. Silent when there is nothing, which is the ordinary state of a
 * workspace between turns and not worth a row saying `+0 −0`.
 *
 * The one place DESIGN.md's monochrome rule might have been asked to bend, and it is not asked:
 * green additions and red deletions would be two saturated things on screen that are not
 * blobatars, and the signs carry the direction without them.
 */
function Churn({ churn }: { churn: UiChurn | undefined }): React.JSX.Element | null {
  // Nothing to say only where blobot could not look. A workspace with nothing in it says so:
  // `clean` is the zero of a live number, not a description of the folder, and an empty slot
  // where the count belongs reads as a count that failed rather than as a count of nothing.
  if (churn === undefined) return null;
  if (churn.added === 0 && churn.removed === 0) return <span className="wsclean">clean</span>;
  return (
    <span
      className="wschurn"
      title={
        churn.partial === true
          ? `${churn.files} files, and more untracked than blobot will count`
          : `${churn.files} file${churn.files === 1 ? '' : 's'} since the last commit`
      }
    >
      <span className="wsadd">+{churn.added}</span>
      <span className="wsdel">−{churn.removed}</span>
    </span>
  );
}


/**
 * The branch, and every branch this worktree could be on instead.
 *
 * **The field is not the filter rule's twelve-row threshold arriving early.** It is the way a
 * new branch is named: there is nowhere else to type one, and a menu that filters with the same
 * words it creates with is one control rather than a list plus a form. So it is always there,
 * and the count beside it behaves exactly as the runtime menu's does once something is typed.
 *
 * **A branch another worktree holds is drawn and refused, never hidden.** git will not check one
 * branch out twice, and the reason is the useful half: *Bob is on it* answers the question the
 * refusal raises, and a menu that dropped those rows would send the user hunting for a branch
 * they can see in their own terminal.
 *
 * Radix holds the popover and cmdk holds the list, which is DESIGN.md's own division: a menu you
 * type into is a combobox, and every Radix menu moves real focus onto the row under the pointer,
 * which takes the field away mid-word.
 */
function BranchPicker({
  teamId,
  agentId,
  branch,
  onSwitched,
}: {
  teamId: string;
  agentId: string;
  branch: string;
  onSwitched: () => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [listing, setListing] = useState<UiBranches | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | undefined>(undefined);

  // Asked when the menu opens rather than kept current: a list of branches nobody is looking at
  // is not worth a subprocess, and it cannot change while the menu is shut except by this menu.
  useEffect(() => {
    if (!open) return;
    let current = true;
    setListing(undefined);
    void window.blobot.listBranches(teamId, agentId).then((answer) => {
      if (current) setListing(answer);
    });
    return () => {
      current = false;
    };
  }, [open, teamId, agentId]);

  const go = (name: string, create: boolean): void => {
    setBusy(true);
    setFailed(undefined);
    void window.blobot
      .switchBranch(teamId, agentId, name, { create })
      .then((result) => {
        if (!result.ok) return setFailed(result.error);
        setOpen(false);
        onSwitched();
      })
      .finally(() => setBusy(false));
  };

  const branches = listing?.branches ?? [];
  const shown = narrowBranches(branches, query);
  const typed = query.trim();
  // Offered only for a name that is not already a branch, because the row above it would then
  // be the same branch twice, once as a switch and once as a create that git would refuse.
  const canCreate = typed !== '' && !branches.some((row) => row.name === typed);

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          // Both die with the menu. A query held between openings would hide branches nobody
          // asked it to hide, and a refusal held over would be about a switch already forgotten.
          setQuery('');
          setFailed(undefined);
        }
      }}
    >
      {/* A chevron, because the border came off: something has to say the branch is a door, and
          on a row of mono facts the chevron is the one mark that means "there is more here". */}
      <Popover.Trigger className="wsbranchpick" title={branch}>
        <GitBranch size={11} aria-hidden />
        <span className="wsbranchname">{short(branch)}</span>
        <ChevronDown size={11} aria-hidden />
      </Popover.Trigger>
      <Popover.Portal>
        {/* Above and right-aligned: the tray lives at the foot of the window, so a popover below
            it would open off-screen, and the trigger sits on the row's right. */}
        <Popover.Content
          className="selectmenu optionsmenu branchmenu"
          side="top"
          align="end"
          sideOffset={8}
          collisionPadding={12}
          onOpenAutoFocus={intoTheField}
        >
          <Command label="Branches" loop shouldFilter={false} className="optionscommand">
            <div className="optionsfilter">
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder="Find a branch, or name a new one"
              />
              <span className="optionscount mono">
                {query === '' ? `${branches.length}` : `${shown.length} of ${branches.length}`}
              </span>
            </div>
            <Command.List tabIndex={-1}>
              {listing === undefined ? (
                <div className="branchnote muted">reading the branches…</div>
              ) : listing.unavailable !== undefined ? (
                <div className="branchnote muted">{listing.unavailable}</div>
              ) : (
                <Command.Empty>{canCreate ? '' : 'Nothing matches'}</Command.Empty>
              )}
              {shown.map((row) => (
                <Command.Item
                  key={row.name}
                  value={row.name}
                  className="selectitem branchitem"
                  disabled={busy || row.heldBy !== undefined || row.current}
                  onSelect={() => go(row.name, false)}
                  title={heldWord(row)}
                >
                  <span className="branchname">{row.name}</span>
                  <Holder held={row.heldBy} />
                  {row.current && (
                    <span className="selecttick">
                      <Check size={13} aria-hidden />
                    </span>
                  )}
                </Command.Item>
              ))}
              {canCreate && (
                <>
                  <div className="optionsrule" aria-hidden />
                  <Command.Item
                    value={`new ${typed}`}
                    className="selectitem branchitem"
                    disabled={busy}
                    onSelect={() => go(typed, true)}
                  >
                    <Plus size={13} aria-hidden />
                    <span className="branchname">
                      new branch <span className="branchnew">{typed}</span>
                    </span>
                  </Command.Item>
                </>
              )}
            </Command.List>
            {failed !== undefined && <div className="branchfailed">{failed}</div>}
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * Focus lands in the field, not on the popover.
 *
 * Radix focuses the content element and cmdk listens for the arrow keys on its own root below
 * that, so a key pressed on the content reaches nothing. `RuntimeOptions` does the same thing
 * for the same reason; the difference is only that this menu always has a field.
 */
const intoTheField = (event: Event): void => {
  event.preventDefault();
  const content = event.currentTarget as HTMLElement | null;
  const field = content?.querySelector('[cmdk-input]') as HTMLElement | null;
  field?.focus();
};

/**
 * Who is standing on a branch git will not hand over, **drawn rather than described**.
 *
 * A teammate gets their face. This is one of the two places DESIGN.md keeps blobatars for —
 * identifying among agents — and the row is a list of names where the reader is looking for a
 * person, so `Bob has it` was a sentence doing a face's job at three times the width. It carries
 * that agent's own hue, because a face derived from the name would be a *second* Bob.
 *
 * The other two holders are not agents and get their own marks: the folder the user opened, and
 * a worktree nobody here made, which keeps its last path segment because that is the only thing
 * blobot knows about it. The sentence survives on the row's `title` for the pointer and the
 * screen reader, since a face is an identity and not an explanation of why the row is refused —
 * the row being visibly disabled is what says that.
 */
function Holder({ held }: { held: UiBranch['heldBy'] }): React.JSX.Element | null {
  if (held === undefined) return null;
  if (held.agentName !== undefined) {
    return (
      <span className="branchheld">
        <Blob
          name={held.agentName}
          size={16}
          {...(held.agentHue === undefined ? {} : { hue: held.agentHue })}
          {...(held.agentShape === undefined ? {} : { shape: held.agentShape })}
        />
      </span>
    );
  }
  if (held.isWorkspace === true) {
    return (
      <span className="branchheld">
        <Folder size={13} aria-hidden />
      </span>
    );
  }
  return <span className="branchheld">{tailOf(held.path)}</span>;
}

/** The sentence, kept for the pointer and the screen reader where the face is the visible half. */
function heldWord(row: UiBranch): string {
  if (row.heldBy === undefined) return '';
  if (row.heldBy.isWorkspace === true) return 'the project folder has this branch checked out';
  if (row.heldBy.agentName !== undefined) return `${row.heldBy.agentName} has this branch checked out`;
  return `${tailOf(row.heldBy.path)} has this branch checked out`;
}

function tailOf(path: string): string {
  return path.split('/').filter((part) => part !== '').pop() ?? 'another worktree';
}

/**
 * The typed words against the branch names.
 *
 * Substring and every token, the same rule the runtime menu's filter uses: `blobot alice` should
 * narrow to one row rather than widening to everything with either word in it. A branch name is
 * a path of words, so this is the one that matches how people say them.
 */
export function narrowBranches(branches: readonly UiBranch[], query: string): UiBranch[] {
  const tokens = query.toLowerCase().split(/\s+/).filter((token) => token !== '');
  if (tokens.length === 0) return [...branches];
  return branches.filter((row) => tokens.every((token) => row.name.toLowerCase().includes(token)));
}

/**
 * What kind of place this is, in blobot's own three words rather than git's.
 *
 * `checkout` for a worktree, because that is what it is and the word survives the user not
 * knowing what a worktree is. A copy says the thing that matters about a copy, which is not its
 * kind but what it costs you, and it says it here rather than in a segment because for a copy
 * there is nothing else on the row.
 */
function placeWord(status: UiWorkspaceStatus): string {
  if (!status.present) return 'workspace not found';
  if (status.kind === 'plain') return 'a copy';
  if (status.kind === 'nested') return 'repositories';
  return 'checkout';
}

/** Every member's status, in the activity column, under its own header. */
export function WorkspacePanel({
  statuses,
  agents,
  looking,
  onRefresh,
  onPublish,
  onPlan,
}: {
  statuses: readonly UiWorkspaceStatus[];
  agents: readonly UiAgent[];
  looking: boolean;
  onRefresh: () => void;
  onPublish: (
    agentId: string,
    options: { title?: string; draft?: boolean },
  ) => Promise<UiPublishResult>;
  onPlan: (
    agentId: string,
    options: { title?: string; draft?: boolean },
  ) => Promise<readonly string[]>;
}): React.JSX.Element | null {
  // A header over nothing is the mistake the empty-feed line exists to avoid, and it is the
  // ordinary state here: a team whose folder is a plain copy has nothing to say.
  if (statuses.length === 0) return null;
  return (
    <div className="ws">
      <div className="wshead">
        <span className="mono muted">WORKSPACE</span>
        <button type="button" className="wsrefresh" onClick={onRefresh} disabled={looking} title="ask GitHub again">
          <RefreshCw size={11} />
        </button>
      </div>
      {statuses.map((status) => (
        <Row
          key={status.agentId}
          status={status}
          named
          {...faceOf(agents, status.agentId)}
          looking={looking}
          onPublish={(options) => onPublish(status.agentId, options)}
          onPlan={(options) => onPlan(status.agentId, options)}
        />
      ))}
    </div>
  );
}

function Row({
  status,
  named = false,
  hue,
  shape,
  looking,
  onRefresh,
  onPublish,
  onPlan,
}: {
  status: UiWorkspaceStatus;
  /**
   * Whether the row says whose it is. The panel's rows do, because they are a list; the line
   * under an agent's composer does not, because the pane it sits in is already that agent and
   * the name would be the third thing on screen saying Alice.
   *
   * Not derived from the hue: a hue is optional on an agent that kept the default, and gating
   * the name on it left a list of branches belonging to nobody.
   */
  named?: boolean;
  hue?: number;
  shape?: string;
  looking: boolean;
  onRefresh?: () => void;
  onPublish: (options: { title?: string; draft?: boolean }) => Promise<UiPublishResult>;
  onPlan: (options: { title?: string; draft?: boolean }) => Promise<readonly string[]>;
}): React.JSX.Element {
  return (
    <div className="wsrow">
      <div className="wsfacts">
        {named && (
          <>
            <Blob
              name={status.agentName}
              size={14}
              {...(hue === undefined ? {} : { hue })}
              {...(shape === undefined ? {} : { shape })}
            />
            <span className="who" title={status.agentName}>
              {status.agentName}
            </span>
          </>
        )}
        <span
          className={`wsbranch${status.branch === undefined || !status.present ? '' : ' named'}`}
          title={status.branch ?? ''}
        >
          {status.branch === undefined || !status.present ? (
            // No branch to name, so the row says what kind of place it is instead of leaving
            // the slot empty and letting the counts read as if they were about a checkout.
            placeWord(status)
          ) : (
            <>
              <GitBranch size={11} aria-hidden />
              {/* Its own element rather than a bare text node, so the panel's rows can clamp it:
                  an anonymous flex item cannot be given an ellipsis. */}
              <span className="b">{short(status.branch)}</span>
            </>
          )}
        </span>
        {segments(status).map((segment) => (
          <span key={segment} className="wsseg">
            {segment}
          </span>
        ))}
        {status.pr !== undefined && (
          <button
            type="button"
            className="wspr"
            onClick={() => void window.blobot.openLink(status.pr?.url ?? '')}
            title={status.pr.title}
          >
            <GitPullRequest size={11} />#{status.pr.number}
            {status.pr.state === 'open' ? '' : ` ${status.pr.state}`}
          </button>
        )}
        {canPublish(status) && <PublishButton onPublish={onPublish} onPlan={onPlan} />}
        {onRefresh !== undefined && (
          <button type="button" className="wsrefresh" onClick={onRefresh} disabled={looking} title="ask GitHub again">
            <RefreshCw size={11} />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Opening a pull request, in a popover over the tray.
 *
 * It was an expander, and an expander was wrong twice over. It pushed the composer's own footing
 * around to make room for a form, so asking a question moved the thing the question was about;
 * and a title field, a checkbox, two commands and two buttons stacked at the tray's full width
 * read as a section of the page rather than as one control's own business. A popover is what
 * this is: a small decision, anchored to the word that raised it, gone when it is over.
 *
 * Radix for behaviour and never for looks, which is DESIGN.md's rule and the reason the
 * dependency is worth taking here: outside-click, Escape, and focus returned to the trigger are
 * the half nobody screenshots, and this is a form that is going to push a branch. Every pixel is
 * from the tokens.
 */
function PublishButton({
  onPublish,
  onPlan,
}: {
  onPublish: (options: { title?: string; draft?: boolean }) => Promise<UiPublishResult>;
  onPlan: (options: { title?: string; draft?: boolean }) => Promise<readonly string[]>;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger className="wsflat">open a pull request</Popover.Trigger>
      <Popover.Portal>
        {/* Above and right-aligned: the tray lives at the foot of the window, so a popover
            below it would open off-screen, and the trigger sits on the row's right. */}
        <Popover.Content className="wspop" side="top" align="end" sideOffset={8} collisionPadding={12}>
          <Publish onPublish={onPublish} onPlan={onPlan} onClose={() => setOpen(false)} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * The form, and it shows the two commands rather than describing them.
 *
 * `detect/remedies.ts` established the rule for the one other place blobot runs a vendor's CLI
 * on the user's behalf: the user is agreeing to the command they would have pasted themselves,
 * so it is written out in full before anything runs. The title is theirs to type and is handed
 * to `execFile` as one argument with no shell in front of it, which is why a title containing a
 * semicolon is a title.
 */
function Publish({
  onPublish,
  onPlan,
  onClose,
}: {
  onPublish: (options: { title?: string; draft?: boolean }) => Promise<UiPublishResult>;
  onPlan: (options: { title?: string; draft?: boolean }) => Promise<readonly string[]>;
  onClose: () => void;
}): React.JSX.Element {
  const [title, setTitle] = useState('');
  const [draft, setDraft] = useState(false);
  const [running, setRunning] = useState(false);
  const [failed, setFailed] = useState<string | undefined>(undefined);
  const [plan, setPlan] = useState<readonly string[]>([]);

  // The plan is built in main, because argv is never the renderer's: the words for the title
  // travel, the command line does not. It is rebuilt as the title is typed, so what is shown is
  // what will run rather than what would have run before the user changed their mind.
  useEffect(() => {
    void onPlan({ title, draft })
      .then(setPlan)
      .catch(() => setPlan([]));
  }, [title, draft, onPlan]);

  const go = (): void => {
    setRunning(true);
    setFailed(undefined);
    void onPublish({ title, draft })
      .then((result) => {
        if (result.ok) return onClose();
        setFailed(
          result.step === 'push'
            ? `the branch did not push. ${result.error}`
            : `the branch is on the remote, but the pull request did not open. ${result.error}`,
        );
      })
      .finally(() => setRunning(false));
  };

  return (
    <div className="wspublish">
      <input
        className="wstitle"
        placeholder="title, or leave it empty to take it from the commits"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        // The field the popover exists for. Nothing else in here is worth arriving on, and a
        // popover that opens with focus on its cancel button is one you have to click into.
        autoFocus
      />
      <label className="wsdraft">
        <input type="checkbox" checked={draft} onChange={(event) => setDraft(event.target.checked)} />
        open it as a draft
      </label>
      {plan.length > 0 && (
        <div className="wsplan">
          {plan.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      )}
      {failed !== undefined && <div className="wsfailed">{failed}</div>}
      <div className="wsactions">
        <button type="button" className="btn" onClick={onClose} disabled={running}>
          cancel
        </button>
        <button type="button" className="btn primary" onClick={go} disabled={running}>
          {running ? 'pushing' : 'push and open'}
        </button>
      </div>
    </div>
  );
}

/**
 * What is loose in this workspace, in order of how often it changes.
 *
 * Counts only. The place is `placeWord`'s job and the pull request has a control of its own,
 * because it is the one thing here that leads somewhere. And *we could not look* is not a
 * segment either, on purpose: it is the absence of `no pr` rather than a phrase, because a row
 * reading "could not check" beside every agent on a machine with no `gh` would be noise about a
 * thing nobody asked for.
 */
function segments(status: UiWorkspaceStatus): readonly string[] {
  if (!status.present) return [];
  if (status.kind === 'plain') return ['no branch, no recovery'];
  const said: string[] = [];
  if (status.changed !== undefined) said.push(status.changed === 0 ? 'clean' : `${status.changed} changed`);
  if (status.ahead !== undefined && status.ahead > 0) said.push(`${status.ahead} ahead`);
  // Said only where it means something: with commits to push and nothing on the remote yet.
  if (status.pr === undefined && status.unavailable === undefined && (status.ahead ?? 0) > 0) said.push('no pr');
  return said;
}

/**
 * Whether there is anything to open a pull request *for*.
 *
 * Commits and no live pull request. A merged or closed one does not block it, because a branch
 * that got more commits after its pull request closed is exactly the case where the user wants
 * another one.
 */
function canPublish(status: UiWorkspaceStatus): boolean {
  if (!status.present || status.kind !== 'git' || status.branch === undefined) return false;
  if (status.unavailable !== undefined) return false;
  if (status.pr?.state === 'open' || status.pr?.state === 'draft') return false;
  return (status.ahead ?? 0) > 0;
}

/** Spread rather than passed, because `exactOptionalPropertyTypes` distinguishes the two. */
function faceOf(
  agents: readonly UiAgent[],
  agentId: string,
): { hue?: number; shape?: string } {
  const agent = agents.find((row) => row.id === agentId);
  return {
    ...(agent?.hue === undefined ? {} : { hue: agent.hue }),
    ...(agent?.shape === undefined ? {} : { shape: agent.shape }),
  };
}

/** `blobot/<team>/<agent>` is deterministic, so the half that identifies the agent is enough. */
function short(branch: string): string {
  const parts = branch.split('/');
  return parts.length > 2 ? parts.slice(1).join('/') : branch;
}
