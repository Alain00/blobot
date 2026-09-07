// Synthetic renderer API only. No providers, credentials, host workspaces or real IPC.
// Draws the rail with both kinds of row, a thread, a pin and a waiting team.
const { contextBridge } = require('electron');
const keys = ["answerPermission","attachBytes","attachPath","attachmentUrl","brief","cancelSpeechDownload","checkSpeechReadiness","chooseAttachment","chooseTeamIcon","chooseWorkspace","closeRuntimeStep","commitWork","contextCeilings","createTeam","deleteRoutine","deleteTeam","describeRuntimeOptions","detectRuntimes","dictationSettings","downloadSpeech","earlier","editAgent","editTeam","feedDictation","hireAgent","inspectWorkspace","listAgents","listBranches","listRoutines","machineIdleAfterMs","markDictation","onBudget","onCommands","onDictation","onEvent","onHandbookWrite","onMessage","onPermission","onPermissionSettled","onRoutineScheduled","onRuntimeStepData","onRuntimeStepExit","onSpeechFile","onSpeechMeasured","onStatus","onTeamChanged","onTurns","openInWorkspace","openLink","openThread","pathOf","pictureUrl","prepareWorkspace","prompt","promptThread","publishBranch","publishPlan","removeAllSpeech","removeHandbookEntry","removeSpeech","removeSpeechKey","resizeRuntimeStep","resumeAfterBudget","retireAgent","routineRuns","routineTargets","runRoutineNow","saveRoutine","saveSpeechKey","seenRoutineRuns","selectTeam","sendRuntimeStepInput","setDictation","setMachineIdleAfterMs","setRoutineArmed","setTeamIcon","snapshot","startDictation","startRuntimeStep","startSpeechTryout","stopDictation","suggestTeamIcon","teamDiskUsage","workspaceStatus"];
const api = Object.fromEntries(keys.map(key => [key, key.startsWith('on') ? () => () => {} : async () => []]));

const face = (id, name, hue, shape) => ({ id, name, hue, shape });
const ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const now = Date.now();
const teams = [
  { id: 'checkout', name: 'checkout', workspacePath: '/w/checkout', workspaceKind: 'git', icon: ICON,
    members: [face('a1','Alice',24,'droplet'), face('b1','Bob',190,'pebble'), face('c1','Cara',300,'bean'), face('d1','Dev',120,'blob')],
    lastActiveAt: now - 60_000, lastLine: 'pushed the retry loop and opened a pull request' },
  { id: 'atlas', name: 'atlas', workspacePath: '/w/atlas', workspaceKind: 'git',
    members: [face('e1','Ida',340,'bean'), face('f1','Nils',80,'pebble')],
    lastActiveAt: now - 900_000, lastLine: 'the migration needs a second pair of eyes' },
  { id: 'notes', name: 'notes', workspacePath: '/w/notes', workspaceKind: 'plain',
    members: [face('g1','Omar',210,'droplet')], lastActiveAt: now - 4 * 3600_000, lastLine: 'tidied the outline' },
  // A thread: never drawn as a team, and its agent's row draws from it.
  { id: 'thread_ida', name: 'Ida', workspacePath: '/home/x/blobot/ida', workspaceKind: 'git', threadFor: 'p_ida',
    members: [face('ida_t','Ida',340,'bean')], lastActiveAt: now - 300_000, lastLine: 'that reads fine to me. want me to commit it?' },
];
const profiles = [
  { id: 'p_ida', name: 'Ida', role: 'reviews', hue: 340, shape: 'bean', hiredAt: now - 90 * 86400_000, threadId: 'thread_ida' },
  { id: 'p_alice', name: 'Alice', role: 'builds the UI', hue: 24, shape: 'droplet', hiredAt: now - 30 * 86400_000 },
  { id: 'p_omar', name: 'Omar', role: 'writes the docs', hue: 210, shape: 'droplet', hiredAt: now - 120_000 },
  { id: 'p_nils', name: 'Nils', role: 'runs the pipeline', hue: 80, shape: 'pebble', hiredAt: now - 400 * 86400_000 },
];
const snapshot = {
  team: { id: 'checkout', name: 'checkout', workspacePath: '/w/checkout', turnBudget: 10, leadAgentId: 'a1' },
  teams, profiles,
  agents: [{ id: 'a1', name: 'Alice', role: 'builds the UI', runtimeLabel: 'Runtime', workspacePath: '/w/a', hue: 24, shape: 'droplet', accepts: { images: true, textFiles: true } }],
  // `atlas` is blocked on a permission nobody is looking at: the one thing an agent row must
  // never carry and a team row must.
  statuses: { e1: 'waiting', g1: 'working' },
  commands: {}, usage: {}, log: { running: [], tools: [], thoughts: [], errors: [], turns: [], compactions: [], pictures: [] },
  handbooks: {}, injection: {}, messages: [], answers: [], moreAbove: false, permissions: [],
  unread: ['ida_t'], turnsThisPrompt: 0, demoMode: false, dictation: 'off',
};
Object.assign(api, {
  snapshot: async () => snapshot,
  listAgents: async () => [],
  detectRuntimes: async () => [],
  workspaceStatus: async () => [],
  selectTeam: async () => ({ ok: true }),
  openThread: async () => ({ ok: true }),
});
contextBridge.exposeInMainWorld('blobot', api);
