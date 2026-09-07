import { useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { SkillDraftInput, SkillPreview, SkillSource } from '../../../shared/skills.js';

export function skillOrigin(source: SkillSource): string {
  switch (source.kind) {
    case 'authored': return 'Created here';
    case 'local-import': return 'Imported from folder';
    case 'git': return source.url.replace(/^https:\/\//, '').replace(/\.git$/, '');
  }
}

export function SkillAdd({ profile, onClose, onSaved, initial, replacing }: {
  profile: { id: string; name: string }; onClose: () => void; onSaved: () => void;
  initial?: SkillPreview; replacing?: string;
}): React.JSX.Element {
  const returnFocus = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : undefined);
  const [mode, setMode] = useState<'folder' | 'link' | 'create'>();
  const [preview, setPreview] = useState(initial);
  const [selected, setSelected] = useState<string[]>(initial?.skills.length === 1 ? [initial.skills[0]!.name] : []);
  const [url, setUrl] = useState(''), [ref, setRef] = useState('');
  const [draft, setDraft] = useState<SkillDraftInput>({ name: '', description: '', instructions: '' });
  const [busy, setBusy] = useState(false), [error, setError] = useState<string>();
  const [folder, setFolder] = useState<string>();
  const act = async (work: () => Promise<void>) => {
    setBusy(true); setError(undefined);
    try { await work(); } catch (error) { setError(error instanceof Error ? error.message : 'This skill could not be added.'); }
    finally { setBusy(false); }
  };
  const show = (value: SkillPreview) => { setPreview(value); setSelected(value.skills.length === 1 ? [value.skills[0]!.name] : []); };
  const fromFolder = () => void act(async () => {
    setMode('folder');
    const path = await window.blobot.skills.chooseFolder();
    if (path) { setFolder(path); show(await window.blobot.skills.preview(profile.id, { kind: 'folder', path })); }
  });
  return <Dialog.Root open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <Dialog.Portal><Dialog.Overlay className="scrim" />
      <Dialog.Content className="modal skilladd" onCloseAutoFocus={(event) => { event.preventDefault(); returnFocus.current?.focus(); }} onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }}>
        <header className="modalhead">
          <Dialog.Title className="subhead lg">{replacing ? `Update ${replacing}` : `Add a skill to ${profile.name}`}</Dialog.Title>
          <Dialog.Close className="iconbtn" disabled={busy} aria-label="Close"><X size={17} aria-hidden /></Dialog.Close>
        </header>
        <Dialog.Description className="note muted">{replacing ? 'Review this version before replacing the personal skill.' : `These skills stay with ${profile.name} across teams.`}</Dialog.Description>
        {!preview && <>
          <div className="skillsources">
            <button className="btn" disabled={busy} onClick={fromFolder}>from folder</button>
            <button className="btn" disabled={busy} aria-pressed={mode === 'link'} onClick={() => { setMode('link'); setError(undefined); }}>from link</button>
            <button className="btn" disabled={busy} aria-pressed={mode === 'create'} onClick={() => { setMode('create'); setError(undefined); }}>create</button>
          </div>
          {mode === undefined && <p className="note muted">Bring your own instructions, scripts and references, or import a collection.</p>}
          {mode === 'folder' && <p className="note muted">Choose a folder containing SKILL.md, or a collection. Its files are copied into {profile.name}’s personal folder.</p>}
          {mode === 'link' && <form className="skillform" onSubmit={(event) => {
            event.preventDefault(); void act(async () => show(await window.blobot.skills.preview(profile.id, { kind: 'git', url, ...(ref.trim() ? { ref: ref.trim() } : {}) })));
          }}>
            <label>Repository or skill link<input className="field" autoFocus value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://git.example.com/team/skills.git" /></label>
            <label>Revision <span className="muted">(optional)</span><input className="field" value={ref} onChange={(event) => setRef(event.target.value)} placeholder="Branch, tag or commit" /></label>
            <p className="note muted">Public Git HTTPS repositories and skills.sh links. For a private repository, import its local clone.</p>
            <div className="skillactions"><button type="button" className="btn" onClick={() => void window.blobot.openLink('https://skills.sh')}>explore skills.sh</button>
              <button className="btn primary" disabled={busy || !url.trim()}>{busy ? 'reading repository…' : 'preview'}</button></div>
          </form>}
          {mode === 'create' && <form className="skillform" onSubmit={(event) => {
            event.preventDefault(); void act(async () => { await window.blobot.skills.create(profile.id, draft); onSaved(); onClose(); });
          }}>
            <label>Name<input className="field" autoFocus value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="customer-research" required /></label>
            <label>When to use it<textarea className="field" rows={2} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
            <label>Instructions<textarea className="field" rows={6} value={draft.instructions} onChange={(event) => setDraft({ ...draft, instructions: event.target.value })} /></label>
            <p className="note muted">Save a draft first. Open its folder to add scripts and resources, then make it available.</p>
            <div className="modalfoot"><button className="btn primary" disabled={busy || !draft.name.trim()}>save draft</button></div>
          </form>}
        </>}
        {preview && <>
          <div className="skillpreviewlist">
            {preview.skills.map((skill) => <div className="skillpreview" key={skill.name}>
              <label className="skillchoice"><input type="checkbox" checked={selected.includes(skill.name)} disabled={busy || replacing !== undefined} onChange={(event) => setSelected(event.target.checked ? [...selected, skill.name] : selected.filter((name) => name !== skill.name))} /><b>{skill.name}</b></label>
              <p>{skill.description}</p><p className="mono muted">{skillOrigin(skill.source)}</p>
              <details><summary>instructions</summary><pre className="skilltext">{skill.text}</pre></details>
              <p className="note muted">Author: {skill.author ?? 'not declared'} · License: {skill.license ?? 'not declared'}{skill.compatibility ? ` · ${skill.compatibility}` : ''}</p>
              <details><summary>{skill.files.length} files</summary><ul className="skillfiles mono">{skill.files.map((file) => <li key={file}>{file}</li>)}</ul></details>
            </div>)}
          </div>
          <div className="modalfoot">
            {!replacing && <button className="btn" disabled={busy} onClick={() => { setPreview(undefined); setError(undefined); }}>back</button>}
            <button className="btn primary" disabled={busy || selected.length === 0} onClick={() => void act(async () => {
              await window.blobot.skills.act(profile.id, replacing ? { kind: 'replace', name: replacing, previewId: preview.id } : { kind: 'install', previewId: preview.id, names: selected });
              onSaved(); onClose();
            })}>{busy ? 'saving…' : replacing ? 'update skill' : `add to ${profile.name}`}</button>
          </div>
        </>}
        {busy && !preview && mode === 'folder' && <p className="note muted" role="status">Reading skill files…</p>}
        {error && <p className="refusal" role="alert">{error}</p>}
        {error && folder && mode === 'folder' && !preview && <div><p className="note muted">For an incomplete skill, keep its instructions and resources in a draft. Choose a single skill folder.</p><button className="btn" disabled={busy} onClick={() => void act(async () => {
          await window.blobot.skills.importDraft(profile.id, folder); onSaved(); onClose();
        })}>keep as draft</button></div>}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
