import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { AgentStatus } from '@blobot/core/domain';
import type { UiAgent, UiAgentMachine } from '../../../shared/api.js';
import { EngineSetupControls } from './MachineSettings.js';
import { READINESS_WORD } from './readiness.js';

export function AgentMachine({ teamId, agent, status }: {
  teamId: string; agent: UiAgent; status: AgentStatus;
}): React.JSX.Element | null {
  const [view, setView] = useState<UiAgentMachine>();
  const [expanded, setExpanded] = useState<boolean>();
  const [error, setError] = useState<string>();
  const [input, setInput] = useState('');
  const [acting, setActing] = useState(false);
  const latest = useRef(0);
  const refresh = useCallback(() => {
    const request = ++latest.current;
    void window.blobot.agentMachine(teamId, agent.id).then((next) => { if (request === latest.current) setView(next); })
      .catch(() => { if (request === latest.current) setError('This sandbox could not be checked. Reopen the team and try again.'); });
  }, [teamId, agent.id]);
  // Sleep changes power without changing runtime status. Recheck the cached-readiness label.
  useEffect(() => { refresh(); }, [refresh, agent.machinePower]);
  useEffect(() => {
    const unsubscribe = [window.blobot.onMachines(refresh),
      window.blobot.onStatus((changedTeam, changedAgent) => { if (changedTeam === teamId && changedAgent === agent.id) refresh(); }),
      window.blobot.onMessage((changedTeam) => { if (changedTeam === teamId) refresh(); })];
    return () => { latest.current += 1; for (const stop of unsubscribe) stop(); };
  }, [refresh, teamId, agent.id]);
  const challengeKey = JSON.stringify(view?.challenge);
  useEffect(() => { setInput(''); }, [view?.operation?.id, challengeKey]);
  useEffect(() => { if (challengeKey !== undefined) setExpanded(true); }, [challengeKey]);
  const placement = agent.machine;
  if (placement?.kind !== 'box') return null;
  const operation = view?.operation, challenge = view?.challenge;
  const signingIn = operation !== undefined && !['done', 'failed', 'cancelled'].includes(operation.phase);
  const working = status !== 'idle' && status !== 'failed';
  const needsAction = status === 'failed' || signingIn || (view?.pendingMessages ?? 0) > 0;
  const open = expanded ?? needsAction;
  const act = (work: () => Promise<unknown>) => {
    setError(undefined); setActing(true);
    void work().then(refresh).catch((error: unknown) => setError(error instanceof Error ? error.message : 'This action did not complete.'))
      .finally(() => setActing(false));
  };
  return <section className="agentmachine" aria-label={`${agent.name}’s sandbox`}>
    <button className="agentmachinehead" onClick={() => setExpanded(!open)} aria-expanded={open}>
      <span>sandbox on this computer</span>
      <span className="mono muted">{placement.limits.maxCpus} CPU{placement.limits.maxCpus === 1 ? '' : 's'} · {placement.limits.maxMemoryBytes / 1024 ** 3} GiB RAM</span>
      <ChevronDown size={13} aria-hidden />
    </button>
    {open && <div className="agentmachinebody">
      {(view?.pendingMessages ?? 0) > 0 && <p className="note">{view?.pendingMessages === 1 ? 'Your message is queued until this agent can work.' : `${view?.pendingMessages} messages are queued until this agent can work.`}</p>}
      {operation !== undefined && <p className="note muted" role="status" aria-live="polite">{operation.detail}</p>}
      {!signingIn && view?.detection !== undefined && <p className="note muted">
        {view.power === 'awake' ? READINESS_WORD[view.detection.readiness] : `last check: ${READINESS_WORD[view.detection.readiness]}`} · {view.detection.detail}
      </p>}
      {challenge?.kind === 'browser' && <div className="machinelogin">
        {challenge.detail && <p className="note muted">{challenge.detail}</p>}
        <div className="machineactions">
          <button className="btn" disabled={acting} onClick={() => act(() => window.blobot.openMachineLogin(teamId, agent.id, operation!.id))}>continue in browser</button>
          {challenge.code !== undefined && <code className="machinelogincode" aria-label="One-time sign-in code">{challenge.code}</code>}
        </div>
        {challenge.input !== undefined && <form className="machinelogininput" onSubmit={(event) => {
          event.preventDefault(); const value = input.trim(); if (!value || acting) return;
          setInput(''); act(() => window.blobot.answerMachineLogin(teamId, agent.id, operation!.id, value));
        }}>
          <label>{challenge.input}<input className="field" type="password" value={input} autoComplete="off" spellCheck={false}
            onChange={(event) => setInput(event.target.value)} /></label>
          <button className="btn" disabled={!input.trim() || acting} type="submit">continue</button>
        </form>}
      </div>}
      {challenge?.kind === 'choice' && <div className="machinelogin">
        <p className="note">{challenge.label}</p>
        <div className="machineactions">{challenge.choices.map((choice) => <button key={choice.value} className="btn" disabled={acting}
          onClick={() => act(() => window.blobot.answerMachineLogin(teamId, agent.id, operation!.id, choice.value))}>{choice.label}</button>)}</div>
      </div>}
      <div className="machineactions">
        {signingIn ? <button className="btn" disabled={acting} onClick={() => act(() => window.blobot.cancelMachineLogin(teamId, agent.id, operation!.id))}>cancel sign-in</button> : <>
          {(status === 'failed' || (view?.pendingMessages ?? 0) > 0) && <button className="btn" disabled={acting}
            onClick={() => act(() => window.blobot.retryMachine(teamId, agent.id))}>try again</button>}
          {(view?.methods ?? []).map((method) => <button key={method.id} className="btn" disabled={acting || working} title={method.detail}
            onClick={() => act(() => window.blobot.startMachineLogin(teamId, agent.id, method.id))}>sign in to {method.label}</button>)}
        </>}
        <button className="btn" onClick={() => act(() => window.blobot.openInWorkspace(teamId, agent.id, '.'))}>open working folder</button>
      </div>
      {error !== undefined && <p className="refusal" role="alert">{error}</p>}
      <details className="machinedisclosure"><summary>Sandbox setup and access</summary>
        <p>This agent has its own home and login. Its working folder and shared Git history are writable on this computer.
          It can reach the Internet and local network, using the runtime’s selected approval settings.</p>
        <p>Its private home holds 8 GiB, with 20 GiB for Docker data. CPU and memory limits are fixed for this sandbox.</p>
        <EngineSetupControls compact />
      </details>
    </div>}
  </section>;
}
