import { useEffect, useState } from 'react';
import { GitBranch, GitPullRequest, RefreshCw } from 'lucide-react';
import type { UiAgent, UiPublishResult, UiWorkspaceStatus } from '../../../shared/api.js';
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

/** The one status under an agent's composer. */
export function WorkspaceLine({
  status,
  looking,
  onRefresh,
  onPublish,
  onPlan,
}: {
  status: UiWorkspaceStatus | undefined;
  looking: boolean;
  onRefresh: () => void;
  onPublish: (options: { title?: string; draft?: boolean }) => Promise<UiPublishResult>;
  onPlan: (options: { title?: string; draft?: boolean }) => Promise<readonly string[]>;
}): React.JSX.Element | null {
  if (status === undefined) return null;
  return (
    <div className="wsline">
      <Row
        status={status}
        looking={looking}
        onRefresh={onRefresh}
        onPublish={onPublish}
        onPlan={onPlan}
      />
    </div>
  );
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
          {...hueOf(agents, status.agentId)}
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
  looking: boolean;
  onRefresh?: () => void;
  onPublish: (options: { title?: string; draft?: boolean }) => Promise<UiPublishResult>;
  onPlan: (options: { title?: string; draft?: boolean }) => Promise<readonly string[]>;
}): React.JSX.Element {
  const [opening, setOpening] = useState(false);

  return (
    <div className="wsrow">
      <div className="wsfacts">
        {named && (
          <>
            <Blob name={status.agentName} size={14} {...(hue === undefined ? {} : { hue })} />
            <span className="who">{status.agentName}</span>
          </>
        )}
        <span className="wsbranch" title={status.branch ?? ''}>
          {status.branch === undefined ? (
            <>copy</>
          ) : (
            <>
              <GitBranch size={11} />
              {short(status.branch)}
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
        {canPublish(status) && (
          <button type="button" className="wsopen" onClick={() => setOpening(!opening)}>
            open a pull request
          </button>
        )}
        {onRefresh !== undefined && (
          <button type="button" className="wsrefresh" onClick={onRefresh} disabled={looking} title="ask GitHub again">
            <RefreshCw size={11} />
          </button>
        )}
      </div>
      {opening && <Publish onPublish={onPublish} onPlan={onPlan} onClose={() => setOpening(false)} />}
    </div>
  );
}

/**
 * The confirm, and it shows the two commands rather than describing them.
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
 * What is true about this workspace, in order of how often it changes.
 *
 * The pull request is not here: it has a control of its own, because it is the one thing on the
 * line that leads somewhere. And *we could not look* is not a segment either, on purpose. It is
 * a tooltip on `no pr`'s absence rather than a phrase, because a line reading "could not check"
 * beside every agent on a machine with no `gh` would be noise about a thing nobody asked for.
 */
function segments(status: UiWorkspaceStatus): readonly string[] {
  if (!status.present) return ['workspace not found'];
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
function hueOf(agents: readonly UiAgent[], agentId: string): { hue?: number } {
  const hue = agents.find((agent) => agent.id === agentId)?.hue;
  return hue === undefined ? {} : { hue };
}

/** `blobot/<team>/<agent>` is deterministic, so the half that identifies the agent is enough. */
function short(branch: string): string {
  const parts = branch.split('/');
  return parts.length > 2 ? parts.slice(1).join('/') : branch;
}
