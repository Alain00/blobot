import { useEffect, useState } from 'react';

export function MachineSleepSettings(): React.JSX.Element {
  const [hours, setHours] = useState('');
  const [saved, setSaved] = useState<number>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    let mounted = true;
    void window.blobot.machineIdleAfterMs().then((value) => {
      if (mounted) { setSaved(value); setHours(String(value / 3_600_000)); }
    }).catch(() => { if (mounted) setError('Sleep settings could not be loaded.'); });
    return () => { mounted = false; };
  }, []);
  const duration = Number(hours) * 3_600_000;
  const valid = hours.trim() !== '' && Number.isSafeInteger(duration) && duration >= 0 && duration <= 365 * 24 * 3_600_000;
  return <form className="machinesleep" onSubmit={(event) => {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true); setError(undefined);
    void window.blobot.setMachineIdleAfterMs(duration).then(setSaved)
      .catch(() => setError('Sleep settings could not be saved.'))
      .finally(() => setBusy(false));
  }}>
    <p className="note muted">An idle agent sleeps to release resources. Send a message to wake it and continue its session.
      Work, queued messages and pending permissions keep it awake. This also applies to agents already open.</p>
    <label className="field">Sleep after this many idle hours
      <input type="number" min="0" max="8760" step="any" value={hours} disabled={saved === undefined || busy}
        onChange={(event) => setHours(event.target.value)} />
    </label>
    <p className="muted">Use 0 to keep agents awake. On this computer, sleep stops the agent process, not your computer.</p>
    <button type="submit" className="btn" disabled={!valid || busy || saved === undefined || saved === duration}>
      {busy ? 'saving…' : 'save'}
    </button>
    {error !== undefined && <p role="alert">{error}</p>}
  </form>;
}
