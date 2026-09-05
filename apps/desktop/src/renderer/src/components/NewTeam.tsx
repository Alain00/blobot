import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Folder, X } from 'lucide-react';
import { Command } from 'cmdk';
import type {
  NewTeamSpec,
  UiAgentProfile,
  UiRuntimeChoice,
  UiWorkspaceInspection,
} from '../../../shared/api.js';
import { HireAgent } from './AgentForm.js';
import { Blob } from './Blob.js';

/**
 * Forming a team, in two questions and nothing else.
 *
 * It was an editorial page — a display line in the hand face, a standfirst, four numbered steps
 * that folded, a turn budget, a lead picker, an icon control and a disclosure that closed it.
 * Every one of those had a reason and the reasons still hold; what did not hold is the sum.
 * Forming a team is the thing standing between a new user and the only thing this app does, and
 * a page read start to finish is a page, not a door. **Rewritten 2026-09-05 at the author's
 * direction, in the shape of opening a direct message**: a bar that floats over whatever was
 * there, a field that is a search and a multi-select at once, an arrow to go on.
 *
 * Everything taken off it either has a default nobody argues with or already lives somewhere a
 * user can reach it. The lead is the first agent picked, which is what it always was until the
 * picker was touched. The turn budget is ten. The icon is offered by the edit dialog the moment
 * the team exists, from the same detection this screen used to run. The roster, the lead and the
 * name are all editable on the team's own row. Nothing is lost that cannot be changed a minute
 * later, which is the test that decided what stayed.
 *
 * What did not come off is ticket 14's disclosure, reduced to the two sentences that carry its
 * whole claim. It is stated and not consented to, as it always was, and it is the one thing here
 * that is not recoverable later: by the time the user could go looking for it, agents are already
 * running in a copy of their folder.
 */
export function NewTeam({
  onCancel,
  onCreate,
  initialProfile,
}: {
  onCancel?: () => void;
  /**
   * Hand the finished spec over and go.
   *
   * The bar does not wait for the team. Creating one instantiates an agent per member, cuts a
   * worktree each and starts a session in every one, which is seconds — and a modal sitting over
   * the app saying *creating…* the whole time is a lock on a window that has nothing wrong with
   * it. So the last thing this surface does is hand over the spec; the rail and the working
   * surface report what happens next, because they are what a team appears in.
   */
  onCreate: (spec: NewTeamSpec) => void;
  /** The profile entry point still uses ordinary team creation and its folder disclosure. */
  initialProfile?: UiAgentProfile;
}): React.JSX.Element {
  /** Which of the two questions is up. There is no third, and there is no way back to a page. */
  const [stage, setStage] = useState<'who' | 'where'>(initialProfile === undefined ? 'who' : 'where');
  const [roster, setRoster] = useState<readonly UiAgentProfile[]>([]);
  const [chosen, setChosen] = useState<readonly string[]>(initialProfile === undefined ? [] : [initialProfile.id]);
  /**
   * Who leads, when the user has said. Until then it is the first one they picked.
   *
   * It shipped as `chosen[0]` and nothing on screen said so, which is a rank assigned by the
   * order somebody happened to press two rows in. The badge in the field carries the word now,
   * and pressing a badge moves it — so the one thing the old page's lead picker did survives
   * the page, in the control that was already there.
   */
  const [lead, setLead] = useState<string | undefined>();
  const [query, setQuery] = useState('');
  const [runtimes, setRuntimes] = useState<readonly UiRuntimeChoice[]>([]);
  const [hiring, setHiring] = useState(false);

  const [name, setName] = useState(initialProfile === undefined ? '' : `With ${initialProfile.name}`);
  const [path, setPath] = useState('');
  const [inspection, setInspection] = useState<UiWorkspaceInspection | undefined>();
  /** `nested` only: the repositories in scope, which is all of them, unpicked and unshown. */
  const [repos, setRepos] = useState<readonly string[]>([]);
  /** Inspecting a big folder takes seconds, and a bar that does not say so looks broken. */
  const [reading, setReading] = useState(false);
  /**
   * Making the folder, which is the one piece of work this bar still waits for.
   *
   * It waits because it is the last thing that can fail with a sentence belonging *here* — a
   * path that cannot be written, a name already taken under `~/blobot`. The team itself is
   * handed over and the bar goes.
   */
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  /** The list, so Tab can take whatever the arrow keys have landed on. */
  const listed = useRef<HTMLDivElement>(null);

  const reloadRoster = useCallback(async (): Promise<void> => {
    setRoster(await window.blobot.listAgents());
  }, []);
  const rescan = useCallback((): void => {
    void window.blobot.detectRuntimes().then(setRuntimes);
  }, []);

  useEffect(() => {
    rescan();
    void reloadRoster();
  }, [reloadRoster, rescan]);

  // Escape leaves, once there is a team to go back to. Captured on the window rather than on
  // the field, the way the navigator does it: a layer that ignores Escape reads as stuck.
  useEffect(() => {
    if (onCancel === undefined) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const pick = (id: string): void => {
    setChosen((current) => (current.includes(id) ? current : [...current, id]));
    setQuery('');
  };
  const drop = (id: string): void => {
    setChosen((current) => current.filter((other) => other !== id));
    // Nobody is promoted in their place: `leading` falls back to the first still in the field,
    // which is where an unanswered lead has always landed.
    setLead((current) => (current === id ? undefined : current));
  };

  const readWorkspace = async (chosenPath: string): Promise<void> => {
    setError(undefined);
    setPath(chosenPath);
    if (name.trim() === '') setName(basename(chosenPath));
    setInspection(undefined);
    setReading(true);
    try {
      const result = await window.blobot.inspectWorkspace(chosenPath);
      if ('error' in result) {
        setPath('');
        setError(result.error);
        return;
      }
      setInspection(result);
      setRepos(result.repos.filter((repo) => repo.hasCommits).map((repo) => repo.path));
      setPath(result.path);
    } finally {
      setReading(false);
    }
  };

  const choose = async (): Promise<void> => {
    const chosenPath = await window.blobot.chooseWorkspace();
    if (chosenPath === undefined) return;
    await readWorkspace(chosenPath);
  };

  // What still blocks: a repository with nothing to branch from, and a folder of repositories
  // with nothing at all in scope. Everything else is a Workspace of one kind or another.
  const usable =
    inspection === undefined ||
    (inspection.kind === 'git'
      ? inspection.hasCommits
      : inspection.kind === 'nested'
        ? repos.length > 0 || inspection.looseFiles
        : true);
  const ready = !reading && !busy && usable && name.trim() !== '' && chosen.length > 0
    && chosen.every((id) => roster.some((agent) => agent.id === id));

  const picked = chosen
    .map((id) => roster.find((agent) => agent.id === id))
    .filter((agent): agent is UiAgentProfile => agent !== undefined);
  /** An unpicked lead is not on the team, so the first one in the field leads instead. */
  const leading = lead !== undefined && chosen.includes(lead) ? lead : chosen[0];

  /**
   * Make the team, making the folder first when the user never picked one.
   *
   * The two doors the old step 02 offered are one control now: pick a folder, or do not and get
   * one under `~/blobot` named after the team. It is not silent — the line under the field says
   * which folder is about to be made, before the arrow is pressed.
   */
  const create = async (): Promise<void> => {
    if (!ready) return;
    setBusy(true);
    setError(undefined);
    let workspace = path;
    let kind = inspection;
    if (workspace === '') {
      const made = await window.blobot.prepareWorkspace(name.trim());
      if ('error' in made) {
        setBusy(false);
        setError(made.error);
        return;
      }
      workspace = made.path;
      kind = made;
      setPath(made.path);
      setInspection(made);
    }
    const spec: NewTeamSpec = {
      name: name.trim(),
      workspacePath: workspace,
      turnBudget: 10,
      profileIds: chosen,
      ...(leading === undefined ? {} : { leadProfileId: leading }),
      ...(kind?.kind === 'nested' ? { repoPaths: repos } : {}),
    };
    onCreate(spec);
  };


  /**
   * The keys, before cmdk sees them, which is what the capture phase is for.
   *
   * Enter is the whole of the ambiguity. With something typed it means *this one*, because the
   * list is narrowed and the highlighted row is what the typing was for. With nothing typed
   * there is nothing to mean but *go on*. Tab takes the highlighted row either way, and Backspace
   * on an empty field takes back the last agent, which is what every field made of items does.
   */
  const keys = (event: React.KeyboardEvent): void => {
    if (event.key === 'Enter' && query === '') {
      event.preventDefault();
      event.stopPropagation();
      if (chosen.length > 0) setStage('where');
      return;
    }
    if (event.key === 'Backspace' && query === '' && chosen.length > 0) {
      event.preventDefault();
      drop(chosen[chosen.length - 1] as string);
      return;
    }
    // Space takes the highlighted row, and only with the field empty, where a space is a
    // character that could not have been meant: a query cannot start with one. Typed into a
    // query it stays a space, because `Compaign Auditor` has one in the middle of it.
    if (event.key === 'Tab' || (event.key === ' ' && query === '')) {
      if (event.key === 'Tab' && event.shiftKey) return;
      // Whatever the arrow keys landed on, and otherwise the top of the list, which is what
      // both these keys mean in a field like this: take the obvious one. cmdk highlights the
      // first row itself once it has laid out, so the fallback is for the frame before that.
      const on =
        listed.current?.querySelector('[cmdk-item][data-selected="true"]') ??
        listed.current?.querySelector('[cmdk-item]');
      if (on === null || on === undefined) return;
      event.preventDefault();
      event.stopPropagation();
      (on as HTMLElement).click();
    }
  };

  return (
    <div
      className="navscrim"
      onMouseDown={onCancel === undefined ? undefined : () => onCancel()}
    >
      <div className="navsheet pickbar" onMouseDown={(event) => event.stopPropagation()}>
        {stage === 'who' ? (
          <div onKeyDownCapture={keys}>
            <Command label="Who is on this team" loop>
              <div className="pickfield">
                {/* The badges and the caret wrap together and the arrow does not wrap with
                    them: it is the way out of this step, so it holds the right edge however
                    many rows of agents are above it. */}
                <div className="pickitems">
                {/* Pressing a badge makes that agent the lead; the × takes them off, and is
                    revealed on hover and `:focus-within` the way *your agents* reveals retiring,
                    for the same reason. It was the whole badge that removed, on the argument
                    that a target inside a small target is a mis-click on the destructive half —
                    which is the argument for this arrangement, not against it, now that there
                    are two things to do here: the press that is easy to hit is the one that
                    changes nothing you cannot see. */}
                {picked.map((agent) => (
                  <span
                    key={agent.id}
                    className={`pickchip${agent.id === leading ? ' lead' : ''}`}
                  >
                    <button
                      className="who"
                      onClick={() => setLead(agent.id)}
                      title={
                        agent.id === leading
                          ? `${agent.name} leads this team`
                          : `Make ${agent.name} the lead`
                      }
                    >
                      <Blob
                        name={agent.name}
                        size={17}
                        {...(agent.hue === undefined ? {} : { hue: agent.hue })}
                        {...(agent.shape === undefined ? {} : { shape: agent.shape })}
                      />
                      <span className="nm">{agent.name}</span>
                      {agent.id === leading && <span className="mono">LEAD</span>}
                    </button>
                    <button
                      className="off"
                      onClick={() => drop(agent.id)}
                      title={`Take ${agent.name} off`}
                      aria-label={`Take ${agent.name} off`}
                    >
                      <X size={11} aria-hidden />
                    </button>
                  </span>
                ))}
                <Command.Input
                  autoFocus
                  value={query}
                  onValueChange={setQuery}
                  placeholder={picked.length === 0 ? 'Who is on this team?' : ''}
                />
                </div>
                <button
                  className="pickgo"
                  disabled={chosen.length === 0}
                  onClick={() => setStage('where')}
                  title="Next"
                  aria-label="Next"
                >
                  <ArrowRight size={15} aria-hidden />
                </button>
              </div>
              <Command.List ref={listed}>
                {/* Two different facts. An empty roster is not a failed search, and telling
                    somebody who has never hired anybody that nobody answers to that name is
                    the app blaming them for its own empty state. */}
                <Command.Empty>
                  {roster.length === 0 ? 'Nobody hired yet' : 'Nobody by that name'}
                </Command.Empty>
                {roster
                  .filter((agent) => !chosen.includes(agent.id))
                  .map((agent) => (
                    <Command.Item
                      key={agent.id}
                      value={rowOf(agent)}
                      keywords={[agent.name, agent.role, agent.runtimeLabel]}
                      onSelect={() => pick(agent.id)}
                    >
                      <Blob
                        name={agent.name}
                        size={20}
                        {...(agent.hue === undefined ? {} : { hue: agent.hue })}
                        {...(agent.shape === undefined ? {} : { shape: agent.shape })}
                      />
                      <span>{agent.name}</span>
                      <span className="r">{agent.role}</span>
                    </Command.Item>
                  ))}
              </Command.List>
            </Command>
            {/* The only other thing you can do from here, and the only way out of an empty
                roster. Outside the list on purpose: it is not somebody you can put on the team,
                and while it was a row in there it was the row cmdk highlighted, because the
                roster arrives a frame late and for that frame it was the only row there was.
                With no agents to Tab to, an ordinary Tab lands on it. */}
            <button className="pickhire" onClick={() => setHiring(true)}>
              hire an agent
            </button>
          </div>
        ) : (
          <>
            <div className="pickfield">
              {/* Who this is for, and the way back to changing it. The team being named is the
                  answer to the question above, and a name is easier to choose while looking at
                  it — so the faces are here rather than left behind on a step you can no longer
                  see. Four, then a count: past four a row of faces stops identifying anybody and
                  starts being a texture, and the number is the part that stays true. */}
              <button
                className="pickback"
                onClick={() => setStage('who')}
                title="Who is on this team"
                aria-label="Who is on this team"
              >
                <span className="stack">
                  {picked.slice(0, FACES).map((agent) => (
                    <Blob
                      key={agent.id}
                      name={agent.name}
                      size={20}
                      {...(agent.hue === undefined ? {} : { hue: agent.hue })}
                      {...(agent.shape === undefined ? {} : { shape: agent.shape })}
                    />
                  ))}
                </span>
                {picked.length > FACES && (
                  <span className="mono">+{picked.length - FACES}</span>
                )}
              </button>
              <div className="pickitems">
              <input
                className="pickinput"
                autoFocus
                value={name}
                placeholder="Name this team"
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return;
                  event.preventDefault();
                  void create();
                }}
              />
              </div>
              <button
                className="pickact"
                onClick={() => void choose()}
                title="Choose a folder"
                aria-label="Choose a folder"
              >
                <Folder size={15} aria-hidden />
              </button>
              <button
                className="pickgo"
                disabled={!ready}
                onClick={() => void create()}
                title="Create the team"
                aria-label="Create the team"
              >
                <ArrowRight size={15} aria-hidden />
              </button>
            </div>
            <Where
              path={path}
              name={name.trim()}
              inspection={inspection}
              repos={repos}
              reading={reading}
              busy={busy}
              {...(error === undefined ? {} : { error })}
            />
          </>
        )}
      </div>

      {hiring && (
        <HireAgent
          runtimes={runtimes}
          onRuntimesChanged={rescan}
          onClose={() => setHiring(false)}
          onHired={async (profileId) => {
            await reloadRoster();
            pick(profileId);
            setHiring(false);
          }}
        />
      )}
    </div>
  );
}

/**
 * The one line under the name, and the two sentences under that.
 *
 * The line is the folder: which one, and what kind, in the words the old step used. When there
 * is no folder it is the folder about to be **made**, named in full before the arrow is pressed,
 * which is what keeps *make one for me* from having become something that happens silently.
 *
 * The two sentences are ticket 14's disclosure at its shortest. What it may claim is unchanged:
 * it says what blobot arranged and never what a runtime will do, and it does not name commands,
 * because blobot can only name them on some runtimes. The levels are not listed here any more —
 * the control is on the agent, where it always was, and the hire form is a click away in the
 * step above this one.
 */
function Where({
  path,
  name,
  inspection,
  repos,
  reading,
  busy,
  error,
}: {
  path: string;
  name: string;
  inspection: UiWorkspaceInspection | undefined;
  repos: readonly string[];
  reading: boolean;
  busy: boolean;
  error?: string;
}): React.JSX.Element {
  const refusal =
    error ??
    (inspection?.kind === 'git' && !inspection.hasCommits
      ? 'No commits here, so there is nothing to branch a workspace from.'
      : inspection?.kind === 'nested' && repos.length === 0 && !inspection.looseFiles
        ? 'Nothing in this folder to work in.'
        : undefined);
  return (
    <>
      {refusal !== undefined && <div className="refusal">{refusal}</div>}
      <div className="pickfoot mono muted">
        {reading
          ? 'looking through this folder…'
          : busy
            ? 'creating…'
            : path !== ''
              ? `${path}${inspection === undefined ? '' : ` · ${workspaceLine(inspection, repos)}`}`
              : `~/blobot/${name === '' ? '…' : name} · blobot makes this folder`}
      </div>
      <div className="pickfoot">
        Each agent gets its own working folder. Its runtime uses the approval settings chosen
        for that agent.
      </div>
    </>
  );
}

/** What kind of Workspace this is, in one clause. */
function workspaceLine(inspection: UiWorkspaceInspection, repos: readonly string[]): string {
  if (inspection.kind === 'plain') return 'a copy per agent, no branch and no diff';
  if (inspection.kind === 'nested') return `${repos.length} repositories`;
  return `git · ${inspection.dirty ? 'uncommitted changes' : 'clean'}`;
}

function basename(path: string): string {
  return path.replace(/\/+$/, '').split('/').pop() ?? '';
}

/**
 * How many faces the name step draws before it counts instead.
 *
 * Four, which is the point at which a row of 20px faces stops identifying anybody and starts
 * being a texture — the same reason the rail's mark stopped drawing them past three, one size
 * up and against a folder rather than a field.
 */
const FACES = 4;

/** One roster row's value in the list. Ids, so two agents called Alice are two rows. */
function rowOf(agent: UiAgentProfile): string {
  return `agent:${agent.id}`;
}
