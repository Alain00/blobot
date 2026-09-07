// Synthetic renderer API only. No providers, credentials, host workspaces or real IPC.
const { contextBridge } = require('electron');
const keys = ["answerPermission", "attachBytes", "attachPath", "attachmentUrl", "brief", "cancelSpeechDownload", "checkSpeechReadiness", "chooseAttachment", "chooseTeamIcon", "chooseWorkspace", "closeRuntimeStep", "commitWork", "contextCeilings", "createTeam", "deleteRoutine", "deleteTeam", "describeRuntimeOptions", "detectRuntimes", "dictationSettings", "downloadSpeech", "earlier", "editAgent", "editTeam", "feedDictation", "hireAgent", "inspectWorkspace", "listAgents", "listBranches", "listRoutines", "machineIdleAfterMs", "markDictation", "onBudget", "onCommands", "onDictation", "onEvent", "onHandbookWrite", "onMessage", "onPermission", "onPermissionSettled", "onRoutineScheduled", "onRuntimeStepData", "onRuntimeStepExit", "onSpeechFile", "onSpeechMeasured", "onStatus", "onTeamChanged", "onTurns", "openInWorkspace", "openLink", "pathOf", "pictureUrl", "prepareWorkspace", "prompt", "publishBranch", "publishPlan", "removeAllSpeech", "removeHandbookEntry", "removeSpeech", "removeSpeechKey", "resizeRuntimeStep", "resumeAfterBudget", "retireAgent", "routineRuns", "routineTargets", "runRoutineNow", "saveRoutine", "saveSpeechKey", "seenRoutineRuns", "selectIndividualTeam", "selectTeam", "sendRuntimeStepInput", "setDictation", "setMachineIdleAfterMs", "setRoutineArmed", "setTeamIcon", "snapshot", "startDictation", "startRuntimeStep", "startSpeechTryout", "stopDictation", "suggestTeamIcon", "teamDiskUsage"];
const api = Object.fromEntries(keys.map(key => [key, key.startsWith('on') ? () => () => {} : async () => []]));
const calls=[];
const profile={id:'mara-profile',name:'Mara',role:'marketing',runtimeId:'fixture',runtimeLabel:'Runtime',teams:['Planning with Mara','Website'],instructions:'Write clearly and ask when the audience is unclear.'};
const mate={id:'mara',name:'Mara',profileId:profile.id};
const solo={id:'solo',name:'Planning with Mara',workspacePath:'/fixture/planning',workspaceKind:'git',members:[mate],leadProfileId:profile.id};
const group={...solo,id:'website',name:'Website',members:[mate,{id:'theo',name:'Theo',profileId:'theo-profile'}]};
let snapshot={team:{id:'website',name:'Website',workspacePath:'/fixture/website',turnBudget:10,leadAgentId:'mara'},teams:[solo,group],agents:[{id:'mara',name:'Mara',role:'marketing',runtimeLabel:'Runtime',workspacePath:'/fixture/worktree',accepts:{images:true,textFiles:true}}],statuses:{mara:'idle'},commands:{},usage:{},log:{running:[],tools:[],thoughts:[],errors:[],turns:[],compactions:[],pictures:[]},handbooks:{},injection:{},messages:[],answers:[],moreAbove:false,permissions:[],demoMode:true,dictation:'off'};
Object.assign(api,{
 snapshot:async()=>snapshot,
 listAgents:async()=>[profile,{...profile,id:'theo-profile',name:'Theo',role:'builder',teams:['Website'],instructions:undefined}],
 detectRuntimes:async()=>[],workspaceStatus:async()=>[],
 selectIndividualTeam:async(profileId,teamId)=>{calls.push({method:'selectIndividualTeam',profileId,teamId});snapshot={...snapshot,team:{...snapshot.team,id:'solo',name:solo.name}};return {ok:true};},
 prepareWorkspace:async name=>{calls.push({method:'prepareWorkspace',name});return {path:'/fixture/'+name,kind:'git',hasCommits:true,dirty:false,repos:[],looseFiles:false};},
 createTeam:async spec=>{calls.push({method:'createTeam',spec});return {ok:true,teamId:'new'};},
 fixtureCalls:async()=>calls,
});
contextBridge.exposeInMainWorld('blobot', api);
