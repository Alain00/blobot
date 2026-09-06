import { useState } from 'react';
import { createPortal } from 'react-dom';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { SkillsApi } from '../../../shared/skills.js';
import { Skills } from './Skills.js';

export function SessionSkills({ teamId, agent }: { teamId: string; agent: { id: string; name: string } }): React.JSX.Element {
  const [open, setOpen] = useState(false), [managing, setManaging] = useState(false);
  const [view, setView] = useState<Awaited<ReturnType<SkillsApi['inventory']>>>(), [error, setError] = useState<string>();
  const refresh = async () => {
    setError(undefined);
    try { setView(await window.blobot.skills.inventory(teamId, agent.id)); }
    catch (error) { setError(error instanceof Error ? error.message : 'Skills could not be inspected.'); }
  };
  return <>
    <Dialog.Root open={open} onOpenChange={(value) => { setOpen(value); if (value) void refresh(); }}>
      <Dialog.Trigger className="btn">{agent.name} · skills</Dialog.Trigger>
      <Dialog.Portal><Dialog.Overlay className="scrim" /><Dialog.Content className="modal skillinventory">
        <header className="modalhead"><Dialog.Title className="subhead lg">Skills for {agent.name} here</Dialog.Title><Dialog.Close className="iconbtn" aria-label="Close"><X size={17} aria-hidden /></Dialog.Close></header>
        <Dialog.Description className="note muted">Files detected for this context. A command is shown only when the runtime also advertises its name. Conflicts do not establish which version won.</Dialog.Description>
        {view && !view.supported && <p className="note muted">This runtime does not support personal skills. Its project and inherited inventory is not available yet.</p>}
        {(['personal', 'project', 'computer'] as const).map((scope) => <section className="skillrows" key={scope}>
          <h2 className="subhead">{scope === 'personal' ? agent.name : scope === 'project' ? 'This project' : 'This computer'}</h2>
          {view?.skills.filter((skill) => skill.scope === scope).map((skill) => <div className="listrow skillrow" key={skill.path}><b>{skill.name}</b><span>{skill.description}</span>
            <span className="mono muted">{skill.conflict ? 'Name conflict · runtime choice unconfirmed' : skill.command ? 'Command advertised by runtime' : 'On disk · runtime use unconfirmed'}</span>
            <details><summary>location</summary><span className="mono skillpath">{skill.path}</span></details></div>)}
          {view && !view.skills.some((skill) => skill.scope === scope) && <p className="note muted">No skills detected.</p>}
          {scope === 'personal' && view?.profileId && <button className="btn" onClick={() => { setOpen(false); setManaging(true); }}>manage {agent.name}’s skills</button>}
        </section>)}
        {error && <p role="alert" className="refusal">{error}</p>}
        <div className="modalfoot"><button className="btn" onClick={() => void refresh()}>refresh</button></div>
      </Dialog.Content></Dialog.Portal>
    </Dialog.Root>
    {managing && view?.profileId && createPortal(<Skills profile={{ id: view.profileId, name: agent.name }} onClose={() => setManaging(false)} />, document.body)}
  </>;
}
