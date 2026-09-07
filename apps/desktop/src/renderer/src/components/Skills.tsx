import { useCallback, useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowLeft, X } from 'lucide-react';
import type { SkillDetail, SkillPreview, UiPersonalSkills } from '../../../shared/skills.js';
import { SkillAdd, skillOrigin } from './SkillAdd.js';

export function Skills({ profile, onClose }: { profile: { id: string; name: string }; onClose: () => void }): React.JSX.Element {
  const [view, setView] = useState<UiPersonalSkills>(), [error, setError] = useState<string>();
  const [adding, setAdding] = useState(false), [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<{ name: string; content: SkillDetail }>();
  const [removing, setRemoving] = useState<string>(), [update, setUpdate] = useState<{ name: string; preview: SkillPreview }>();
  const [message, setMessage] = useState<string>();
  const latest = useRef(0);
  const detailName = useRef<string | undefined>(undefined);
  const removeButton = useRef<HTMLButtonElement>(null);
  detailName.current = detail?.name;
  const reload = useCallback(async () => {
    const sequence = ++latest.current;
    try {
      const value = await window.blobot.skills.list(profile.id);
      const name = detailName.current;
      const content = name && value.skills.some((skill) => skill.name === name) ? await window.blobot.skills.read(profile.id, name) : undefined;
      if (sequence === latest.current) { setView(value); setError(undefined); if (name === detailName.current && content) setDetail({ name: name!, content }); }
    }
    catch (error) { if (sequence === latest.current) setError(error instanceof Error ? error.message : 'Skills could not be read.'); }
  }, [profile.id]);
  useEffect(() => {
    void reload();
    const refresh = () => void reload();
    window.addEventListener('focus', refresh);
    const unsubscribe = window.blobot.onTeamChanged?.(refresh);
    return () => { latest.current++; window.removeEventListener('focus', refresh); unsubscribe?.(); };
  }, [reload]);
  const modal = adding || removing !== undefined || update !== undefined;
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !modal && !document.querySelector('[role="dialog"]')) { if (detail) setDetail(undefined); else onClose(); }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [modal, detail, onClose]);
  const act = async (work: () => Promise<void>) => {
    setBusy(true); setError(undefined); setMessage(undefined);
    try { await work(); await reload(); } catch (error) { setError(error instanceof Error ? error.message : 'This change did not complete.'); }
    finally { setBusy(false); }
  };
  const selected = view?.skills.find((skill) => skill.name === detail?.name);
  const pending = (name: string) => view?.pending.some((item) => item.name === name) ?? false;
  return <div className="agentspage skillspage"><div className="agentssheet skillssheet">
    <header className="agentshead">
      <button className="iconbtn" aria-label={detail ? 'Back to skills' : 'Back'} onClick={() => detail ? setDetail(undefined) : onClose()}><ArrowLeft size={17} aria-hidden /></button>
      <div><div className="eyebrow mono">PERSONAL SKILLS</div><h1 className="subhead lg">{detail?.name ?? profile.name}</h1></div>
      <span className="skillspacer" />
      {!detail && <button className="btn" disabled={busy} onClick={() => setAdding(true)}>add skill</button>}
    </header>
    {view && !view.supported && <p className="note muted">This agent’s current runtime does not support personal skills. You can prepare the kit here and use it with a compatible runtime.</p>}
    {view && view.pending.length > 0 && <section className="skillpending" aria-label="Pending skill changes">
      <p>Pending · close {profile.name}’s sessions to apply. Existing work continues.</p>
      <div className="skillactions">{view.sessions.map((session) => <button key={session.teamId} className="btn" onClick={() => void act(async () => {
        const result = await window.blobot.selectTeam(session.teamId); if (!result.ok) throw new Error(result.error ?? 'This team could not be opened.'); onClose();
      })}>{session.teamName}</button>)}</div>
      {view.pending.map((item) => <div key={item.id} className="skillpendingrow"><span><b>{item.name}</b> · {item.action}{item.error && <span className="refusal">{item.error}</span>}</span>
        <button className="btn" disabled={busy} onClick={() => void act(() => window.blobot.skills.act(profile.id, { kind: 'cancel', id: item.id }))}>cancel change</button></div>)}
    </section>}
    {detail && selected ? <>
      <p>{selected.description}</p><div className="skillactions">
        <button className="btn" disabled={busy} onClick={() => void act(() => window.blobot.skills.act(profile.id, { kind: 'open', name: selected.name }))}>open folder to edit</button>
        {(selected.source.kind !== 'authored' || selected.modified) && <button className="btn" disabled={busy || pending(selected.name)} onClick={() => void act(() => window.blobot.skills.act(profile.id, { kind: 'make-personal', name: selected.name }))}>{selected.source.kind === 'authored' ? 'keep edits' : 'make a personal copy'}</button>}
        {selected.source.kind === 'git' && <button className="btn" disabled={busy || pending(selected.name)} onClick={() => void act(async () => {
          const result = await window.blobot.skills.check(profile.id, selected.name);
          if (result.changed) setUpdate({ name: selected.name, preview: result.preview }); else setMessage('This skill is up to date.');
        })}>check for updates</button>}
        {selected.source.kind === 'local-import' && <button className="btn" disabled={busy || pending(selected.name)} onClick={() => void act(async () => {
          const path = await window.blobot.skills.chooseFolder(); if (!path) return;
          const preview = await window.blobot.skills.preview(profile.id, { kind: 'folder', path });
          const skill = preview.skills.find((item) => item.name === selected.name);
          if (!skill) throw new Error('Choose a folder containing the same skill name.');
          setUpdate({ name: selected.name, preview: { ...preview, skills: [skill] } });
        })}>reimport folder</button>}
        <button ref={removeButton} className="btn" disabled={busy || pending(selected.name)} onClick={() => setRemoving(selected.name)}>remove</button>
      </div>
      <p className="note muted">Edits to files may affect open sessions. Imported copies stop receiving remote updates when made personal.</p>
      <dl className="skillmetadata"><dt>Source</dt><dd>{skillOrigin(selected.source)}</dd>{selected.origin && <><dt>Originally from</dt><dd>{skillOrigin(selected.origin)}</dd></>}
        <dt>Author</dt><dd>{selected.author ?? 'Not declared'}</dd><dt>License</dt><dd>{selected.license ?? 'Not declared'}</dd>{selected.compatibility && <><dt>Compatibility</dt><dd>{selected.compatibility}</dd></>}
        {selected.source.kind === 'git' && <><dt>Revision</dt><dd className="mono">{selected.source.resolvedCommit}</dd><dt>Source folder</dt><dd className="mono">{selected.source.skillPath || '/'}</dd></>}
        <dt>Folder</dt><dd className="mono">{detail.content.path}</dd></dl>
      {selected.modified && <p className="note">Edited locally. Keep these edits as a personal copy before updating or removing.</p>}
      <details><summary>{detail.content.files.length} files</summary><ul className="skillfiles mono">{detail.content.files.map((file) => <li key={file}>{file}</li>)}</ul></details>
      <pre className="skilltext">{detail.content.text}</pre>
    </> : <>
      <p className="note muted">Personal skills travel with {profile.name} to every team. Changes become available when all of this agent’s sessions have closed.</p>
      {view?.skills.length === 0 && view.drafts.length === 0 && <p className="note">No skills yet. Bring a custom folder, import a repository, or write your own.</p>}
      <div className="skillrows">{view?.skills.map((skill) => <button key={skill.name} className="listrow skillrow" disabled={busy} onClick={() => void act(async () => {
        if (skill.error) throw new Error(skill.error);
        setDetail({ name: skill.name, content: await window.blobot.skills.read(profile.id, skill.name) });
      })}><b>{skill.name}</b><span className="muted">{skill.description}</span><span className="mono muted">{skillOrigin(skill.source)}{skill.modified ? ' · Edited locally' : ''}</span>{skill.error && <span className="refusal">{skill.error}</span>}</button>)}</div>
      {view && view.drafts.length > 0 && <section className="skillrows" aria-label="Drafts"><h2 className="subhead">Drafts</h2>
        {view.drafts.map((draft) => <div key={draft.id} className="listrow skilldraft"><span><b>{draft.name}</b><span className="mono muted"> · Draft</span></span><div className="skillactions">
          <button className="btn" disabled={busy} onClick={() => void act(() => window.blobot.skills.act(profile.id, { kind: 'open-draft', id: draft.id }))}>open folder to edit</button>
          <button className="btn" disabled={busy || pending(draft.name)} onClick={() => void act(() => window.blobot.skills.act(profile.id, { kind: 'publish-draft', id: draft.id }))}>make available</button>
        </div></div>)}
      </section>}
      {view && view.history.length > 0 && <details><summary>Recover a previous skill</summary><div className="skillrows">
        {view.history.map((item) => <div key={item.id} className="listrow skilldraft"><span>{item.name}</span><button className="btn" disabled={busy || view.skills.some((skill) => skill.name === item.name) || pending(item.name)} onClick={() => void act(() => window.blobot.skills.act(profile.id, { kind: 'restore', id: item.id, name: item.name }))}>restore</button></div>)}
        <p className="note muted">The last 20 removed or replaced versions are kept. Remove the current skill before restoring a previous version.</p>
      </div></details>}
    </>}
    {message && <p className="note" role="status">{message}</p>}
    <div><button className="btn" disabled={busy} onClick={() => void act(() => window.blobot.skills.act(profile.id, { kind: 'open-personal' }))}>open personal folder</button></div>
    {error && <p className="refusal" role="alert">{error} <button className="btn" disabled={busy} onClick={() => void reload()}>refresh</button></p>}
    {adding && <SkillAdd profile={profile} onClose={() => setAdding(false)} onSaved={() => void reload()} />}
    {update && <SkillAdd profile={profile} replacing={update.name} initial={update.preview} onClose={() => setUpdate(undefined)} onSaved={() => { setDetail(undefined); void reload(); }} />}
    <Dialog.Root open={removing !== undefined} onOpenChange={(open) => { if (!open && !busy) setRemoving(undefined); }}><Dialog.Portal><Dialog.Overlay className="scrim" /><Dialog.Content className="modal" onCloseAutoFocus={(event) => { event.preventDefault(); removeButton.current?.focus(); }}>
      <header className="modalhead"><Dialog.Title className="subhead lg">Remove {removing}?</Dialog.Title><Dialog.Close className="iconbtn" disabled={busy} aria-label="Close"><X size={17} /></Dialog.Close></header>
      <Dialog.Description className="note muted">It will leave {profile.name}’s kit after open sessions close. A recoverable copy of its files is kept.</Dialog.Description>
      <div className="modalfoot"><Dialog.Close className="btn" disabled={busy}>keep skill</Dialog.Close><button className="btn primary" disabled={busy} onClick={() => void act(async () => { await window.blobot.skills.act(profile.id, { kind: 'remove', name: removing! }); setRemoving(undefined); setDetail(undefined); })}>remove skill</button></div>
      {error && <p role="alert" className="refusal">{error}</p>}
    </Dialog.Content></Dialog.Portal></Dialog.Root>
  </div></div>;
}
