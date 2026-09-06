import { dialog, ipcMain, shell } from 'electron';
import { join } from 'node:path';
import { inspectSkillLocations, type SqliteStore } from '@blobot/core';
import type { SkillInput, SkillDraftInput } from '@blobot/core/domain';
import type { SkillAction, UiPersonalSkills } from '../shared/skills.js';
import type { DesktopMachines } from './machines.js';
import type { RunningTeam } from './running-team.js';
import { skillsFor } from './runtime-for.js';

export function registerSkillsIpc(options: {
  store: () => SqliteStore | undefined;
  machines: () => DesktopMachines | undefined;
  teams: () => readonly RunningTeam[];
}): void {
  const access = (id: string) => {
    const profile = options.store()?.profileById(id), machines = options.machines();
    if (!profile || !machines) throw new Error('This agent profile is unavailable.');
    return { profile, skills: machines.skills };
  };
  ipcMain.handle('skills:list', async (_event, id: string): Promise<UiPersonalSkills> => {
    const { profile, skills } = access(id);
    const catalogue = await skills.list(id);
    return { ...catalogue, supported: skillsFor(profile.runtimeId).personal, history: await skills.history(id), sessions: options.teams()
      .filter((team) => team.agents.some((agent) => agent.profileId === id && team.executions?.get(agent.id)?.power !== 'asleep'))
      .map(({ team }) => ({ teamId: team.id, teamName: team.name })) };
  });
  ipcMain.handle('skills:chooseFolder', async () => {
    const result = await dialog.showOpenDialog({ title: 'Choose a skill folder or collection', properties: ['openDirectory'] });
    return result.canceled ? undefined : result.filePaths[0];
  });
  ipcMain.handle('skills:preview', (_event, id: string, input: SkillInput) => access(id).skills.preview(id, input));
  ipcMain.handle('skills:create', (_event, id: string, input: SkillDraftInput) => access(id).skills.createDraft(id, input));
  ipcMain.handle('skills:importDraft', (_event, id: string, path: string) => access(id).skills.importDraft(id, path));
  ipcMain.handle('skills:read', (_event, id: string, name: string) => access(id).skills.read(id, name));
  ipcMain.handle('skills:check', (_event, id: string, name: string) => access(id).skills.check(id, name));
  ipcMain.handle('skills:act', async (_event, id: string, action: SkillAction) => {
    const { skills } = access(id);
    switch (action.kind) {
      case 'open-personal': {
        const directory = await skills.directories.forProfile(id).prepare();
        const error = await shell.openPath(directory.path); if (error) throw new Error(error); return;
      }
      case 'install': return skills.install(id, action.previewId, action.names);
      case 'replace': return skills.replace(id, action.name, action.previewId);
      case 'remove': return skills.remove(id, action.name);
      case 'make-personal': return skills.makePersonal(id, action.name);
      case 'publish-draft': return skills.publishDraft(id, action.id);
      case 'cancel': return skills.cancel(id, action.id);
      case 'restore': return skills.restore(id, action.id, action.name);
      case 'open': case 'open-draft': {
        const path = 'name' in action ? await skills.skillPath(id, action.name) : await skills.draftPath(id, action.id);
        const error = await shell.openPath(path);
        if (error) throw new Error(error);
        return;
      }
      default: throw new Error('Unknown skill action.');
    }
  });
  ipcMain.handle('skills:inventory', async (_event, teamId: string, agentId: string) => {
    const live = options.teams().find((item) => item.team.id === teamId), record = options.store()?.agentById(agentId);
    const agent = live?.agents.find((item) => item.id === agentId);
    if (!live || !agent || record?.teamId !== teamId) throw new Error('Open the agent’s team to inspect its skills.');
    const discovery = skillsFor(record.runtimeId), machine = live.machines?.get(agentId)?.location();
    const locations = [...discovery.locations(agent.workspacePath, machine?.kind === 'box', machine?.sharedSkillsPath)];
    if (record.profileId) {
      const { skills } = access(record.profileId);
      // Validate identity even when the runtime does not support native personal discovery.
      const personal = await skills.directories.forProfile(record.profileId).prepare();
      locations.unshift({ path: join(personal.path, '.agents/skills'), scope: 'personal', boundary: personal.path });
    }
    const commands = live.executions?.get(agentId)?.availableCommands.map((item) => item.name) ?? [];
    return { ...(record.profileId ? { profileId: record.profileId } : {}), supported: discovery.personal,
      skills: await inspectSkillLocations(locations, commands) };
  });
}
