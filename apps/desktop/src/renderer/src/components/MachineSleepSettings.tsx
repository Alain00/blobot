import { useEffect, useState } from 'react';

/**
 * How many teams stay loaded at once.
 *
 * Its own form beside sleep, and beside it rather than inside it because the two answer
 * different questions: sleep is what an idle agent does, this is what happens to a team you
 * looked away from. It was a hard three, so opening a fourth team stopped a Machine the user
 * was watching with nothing on screen saying why.
 */
export function LiveTeamSettings(): React.JSX.Element {
  const [count, setCount] = useState('');
  const [saved, setSaved] = useState<number>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    let mounted = true;
    void window.blobot.liveTeamLimit().then((value) => {
      if (mounted) { setSaved(value); setCount(String(value)); }
    }).catch(() => { if (mounted) setError('That setting could not be loaded.'); });
    return () => { mounted = false; };
  }, []);
  const wanted = Number(count);
  const valid = count.trim() !== '' && Number.isSafeInteger(wanted) && wanted >= 1 && wanted <= 100;
  return <form className="machinesleep" onSubmit={(event) => {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true); setError(undefined);
    void window.blobot.setLiveTeamLimit(wanted).then((value) => { setSaved(value); setCount(String(value)); })
      .catch(() => setError('That setting could not be saved.'))
      .finally(() => setBusy(false));
  }}>
    <p className="note muted">Teams you switch away from stay loaded, so their agents keep their session and
      their Machine stays awake. Past this count the least recently opened team is stopped.</p>
    <label className="field">Teams that stay loaded
      <input type="number" min="1" max="100" step="1" value={count} disabled={saved === undefined || busy}
        onChange={(event) => setCount(event.target.value)} />
    </label>
    <p className="muted">Each loaded team costs a process per agent. A team that is working is never stopped.</p>
    <button type="submit" className="btn" disabled={!valid || busy || saved === undefined || saved === wanted}>
      {busy ? 'saving…' : 'save'}
    </button>
    {error !== undefined && <p role="alert">{error}</p>}
  </form>;
}

export function MachineSleepSettings(): React.JSX.Element {
  const [hours, setHours] = useState('');
  const [saved, setSaved] = useState<number>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [repairing, setRepairing] = useState(false);
  useEffect(() => {
    let mounted = true;
    void Promise.all([window.blobot.machineIdleAfterMs(), window.blobot.engineSetup()]).then(([value, setup]) => {
      if (mounted) { setSaved(value); setHours(setup?.sleepError ? '' : String(value / 3_600_000)); setError(setup?.sleepError); setRepairing(setup?.sleepError !== undefined); }
    }).catch(() => { if (mounted) setError('Sleep settings could not be loaded.'); });
    return () => { mounted = false; };
  }, []);
  const duration = Number(hours) * 3_600_000;
  const valid = hours.trim() !== '' && Number.isSafeInteger(duration) && duration >= 0 && duration <= 365 * 24 * 3_600_000;
  return <form className="machinesleep" onSubmit={(event) => {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true); setError(undefined);
    void window.blobot.setMachineIdleAfterMs(duration).then((value) => { setSaved(value); setRepairing(false); })
      .catch(() => setError('Sleep settings could not be saved.'))
      .finally(() => setBusy(false));
  }}>
    <p className="note muted">An idle agent sleeps to release resources, and a message wakes it into the same session.
      Work, queued messages and pending permissions keep it awake.</p>
    <label className="field">Sleep after this many idle hours
      <input type="number" min="0" max="8760" step="any" value={hours} disabled={saved === undefined || busy}
        onChange={(event) => setHours(event.target.value)} />
    </label>
    <p className="muted">0 keeps agents awake. Sleep stops the agent, never this computer.</p>
    <button type="submit" className="btn" disabled={!valid || busy || saved === undefined || (!repairing && saved === duration)}>
      {busy ? 'saving…' : 'save'}
    </button>
    {error !== undefined && <p role="alert">{error}</p>}
  </form>;
}
