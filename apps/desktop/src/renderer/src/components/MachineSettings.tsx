import { useCallback, useEffect, useRef, useState } from 'react';
import type { EngineSetupView } from '../../../shared/api.js';
import { MachineSleepSettings } from './MachineSleepSettings.js';

export function EngineSetupControls({ compact = false }: { compact?: boolean }): React.JSX.Element {
  const [view, setView] = useState<EngineSetupView>();
  const [error, setError] = useState<string>();
  const latest = useRef(0);
  const refresh = useCallback(() => {
    const request = ++latest.current;
    void window.blobot.engineSetup().then((next) => { if (request === latest.current) setView(next); })
      .catch(() => { if (request === latest.current) setError('Sandbox setup could not be checked.'); });
  }, []);
  useEffect(() => { refresh(); const stop = window.blobot.onMachines(refresh); return () => { latest.current += 1; stop(); }; }, [refresh]);
  const operation = view?.operation;
  const busy = operation !== undefined && !['done', 'failed', 'cancelled'].includes(operation.phase);
  const installed = view !== undefined && view.readiness.state !== 'not_installed';
  const act = (kind: 'install' | 'sign_in' | 'check') => {
    setError(undefined);
    void window.blobot.startEngineSetup(kind).then(refresh).catch((error: unknown) => setError(error instanceof Error ? error.message : 'Sandbox setup did not start.'));
  };
  return <div className={`machinesetup${compact ? ' compact' : ''}`}>
    {!compact && <h2 className="subhead">Sandboxes on this computer</h2>}
    <p className="note muted">{view?.previewEnabled ? 'Sandbox preview is enabled. Account sign-in and platform validation are still being reviewed.' : 'Sandboxes are awaiting release validation. Preview is disabled in this build.'}</p>
    <p className="note muted">Each agent gets a private home and its own runtime login. Your working folders stay on this computer.</p>
    <p className="note muted">Setup uses a Docker account and disables SSH credential forwarding in the shared sandbox engine.
      It may restart that engine when no sandboxes are open.</p>
    <div className="machineactions">
      <button className="btn" disabled={view === undefined || busy || (!installed && !view.canInstall)} onClick={() => act('install')}>
        set up sandboxes
      </button>
      {installed && <button className="btn" disabled={busy} onClick={() => act('sign_in')}>sign in to Docker</button>}
      {installed && <button className="btn" disabled={busy} onClick={() => act('check')}>check again</button>}
      {busy && <button className="btn" onClick={() => { if (operation) void window.blobot.cancelEngineSetup(operation.id).then(refresh); }}>cancel</button>}
    </div>
    <p className="note muted" role="status" aria-live="polite">
      {operation?.detail ?? (view?.readiness.state === 'ready' ? 'Sandboxes are ready.' : view?.readiness.detail ?? 'Checking sandbox setup…')}
      {operation?.received !== undefined && <span className="mono"> · {Math.round(operation.received / 1024 ** 2)} MB
        {operation.total === undefined ? '' : ` of ${Math.round(operation.total / 1024 ** 2)} MB`}</span>}
    </p>
    {view?.canInstall === false && !installed && <p className="refusal">Sandbox installation is unavailable for this computer. Agents can still work directly on this computer.</p>}
    {view?.kvmAvailable === false && <p className="refusal">This account needs access to Linux virtualization. An administrator can enable KVM and grant access to its group. Sign out and back in after that change.</p>}
    {error !== undefined && <p className="refusal" role="alert">{error}</p>}
    <details className="machinedisclosure">
      <summary>About sandbox setup</summary>
      <p>Setup downloads Docker Sandboxes and uses your Docker account. It turns off SSH credential forwarding in the shared engine.
        If that setting needs changing, close other sandboxes first. Linux may open the system installer and ask for administrator approval.</p>
      <p>Docker’s <a href="https://www.docker.com/legal/docker-subscription-service-agreement/" onClick={(event) => { event.preventDefault(); void window.blobot.openLink(event.currentTarget.href); }}>terms</a> and{' '}
        <a href="https://www.docker.com/legal/docker-privacy-policy/" onClick={(event) => { event.preventDefault(); void window.blobot.openLink(event.currentTarget.href); }}>privacy policy</a> apply.
        The runtime’s own account terms and telemetry settings also apply.</p>
    </details>
    {!compact && (view?.configuredMachines.length ?? 0) > 0 && <section className="machineregister">
      <h2 className="subhead">Agent sandboxes</h2>
      <p className="note muted">Saved CPU and memory limits. Open the agent’s conversation to sign in or retry.</p>
      <dl>{view?.configuredMachines.map((machine) => <div key={`${machine.teamId}:${machine.agentId}`}>
        <dt>{machine.agentName} <span className="muted">· {machine.teamName}</span></dt>
        <dd className="mono muted">{machine.limits.maxCpus} CPU{machine.limits.maxCpus === 1 ? '' : 's'} · {machine.limits.maxMemoryBytes / 1024 ** 3} GiB RAM</dd>
      </div>)}</dl>
    </section>}
  </div>;
}

export function MachineSettings(): React.JSX.Element {
  return <div className="machinesettings">
    <EngineSetupControls />
    <section><h2 className="subhead">Sleep</h2><MachineSleepSettings /></section>
  </div>;
}
