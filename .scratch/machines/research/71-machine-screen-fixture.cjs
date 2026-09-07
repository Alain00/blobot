const { _electron: electron } = require('/Users/guillermo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const dir = '/private/tmp/blobot-machines-ui-review';
(async () => {
  await fs.mkdir(dir, {recursive:true});
  const env = {...process.env,BLOBOT_MACHINES_PREVIEW:'1'}; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({executablePath:'/Users/guillermo/Work/blobot/apps/desktop/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron',
    cwd:'/Users/guillermo/Work/blobot/apps/desktop',args:['.','--demo','--screen=settings:machines','--user-data-dir='+dir+'/data'],env});
  try {
    console.log('electron started', app.process().pid);
    app.process().stderr.on('data',chunk=>console.log('electron:',String(chunk).slice(0,500)));
    const page = await app.firstWindow();
    page.setDefaultTimeout(15000);
    console.log('window',page.url());
    await page.waitForLoadState('domcontentloaded');
    await page.getByRole('button',{name:'Machines',exact:true}).click();
    await page.getByRole('heading',{name:'Sandboxes on this computer'}).waitFor();
    await page.getByRole('button',{name:'check again',exact:true}).waitFor();
    await page.screenshot({path:dir+'/settings.png',scale:'css',animations:'disabled'});
    console.log((await page.locator('body').innerText()).slice(0,7000));
    await fs.writeFile(dir+'/buttons.json',JSON.stringify(await page.getByRole('button').allTextContents(),null,2));
    const snapshot=await page.evaluate(()=>window.blobot.snapshot());
    await app.evaluate(({ipcMain},snapshot)=>{
      const box={kind:'box',limits:{maxCpus:2,maxMemoryBytes:4*1024**3}};
      snapshot.agents[0].machine=box;snapshot.statuses.alice='failed';
      const profiles=snapshot.agents.map((a,i)=>({...a,id:'profile-'+i,runtimeId:'claude',instructions:'',teams:[],trust:'normal'}));
      const replace=(name,fn)=>{ipcMain.removeHandler('blobot:'+name);ipcMain.handle('blobot:'+name,fn);};
      replace('snapshot',()=>snapshot);
      replace('listAgents',()=>profiles);
      replace('engineSetup',()=>({readiness:{state:'not_installed',detail:'Sandbox software is not installed.'},canInstall:true,kvmAvailable:true,previewEnabled:true,
        configuredMachines:[{teamId:'team',agentId:'alice',teamName:'checkout',agentName:'Alice',limits:box.limits}]}));
      replace('agentMachine',()=>({placement:box,power:'awake',pendingMessages:1,methods:[{id:'fixture',label:'Runtime'}],
        operation:{id:'fixture',phase:'waiting',detail:'Continue this agent’s sign-in.'},
        challenge:{kind:'browser',url:'https://example.com',input:'Paste the authorization code from your browser.'}}));
      replace('chooseWorkspace',()=>'/fixture/project');
      replace('inspectWorkspace',()=>({path:'/fixture/project',kind:'git',hasCommits:true,dirty:false,branch:'main',repos:[],looseFiles:false}));
      replace('suggestTeamIcon',()=>undefined);
      replace('createTeam',(_event,spec)=>{globalThis.machineUiSpec=spec;return {ok:false,error:'Review fixture: no team was created.'};});
    },snapshot);
    const base=page.url().split('#')[0];
    await page.reload();
    await page.getByRole('heading',{name:'Agent sandboxes',exact:true}).waitFor();
    await page.screenshot({path:dir+'/settings-registry.png',scale:'css',animations:'disabled'});
    await page.goto(base+'#pane=alice');await page.reload();
    await page.getByRole('button',{name:'continue in browser',exact:true}).waitFor();
    await page.screenshot({path:dir+'/agent-login.png',scale:'css',animations:'disabled'});
    const loginInput=page.locator('.machinelogininput input');
    if(!await loginInput.isVisible())throw Error('Login input is hidden');
    const overlapping=await page.evaluate(()=>{const login=document.querySelector('.agentmachine').getBoundingClientRect(),pill=document.querySelector('.pill').getBoundingClientRect();return login.bottom>pill.top;});
    if(overlapping)throw Error('Sandbox controls overlap composer');
    await page.goto(base+'#screen=new-team');await page.reload();
    await page.getByRole('option').filter({hasText:'Alice'}).click();
    await page.getByRole('option').filter({hasText:'Bob'}).click();
    console.log('creation buttons',await page.getByRole('button').allTextContents());
    await page.getByRole('button',{name:'Next',exact:true}).click();
    await page.getByPlaceholder('Name this team').fill('machine-review');
    await page.getByRole('button',{name:'Choose a folder',exact:true}).click();
    await page.getByRole('combobox',{name:'Where this team works',exact:true}).click();
    await page.getByRole('option',{name:/a sandbox on this computer/}).click();
    await page.getByText('Choose for each agent',{exact:true}).click();
    await page.getByRole('combobox',{name:'Where Bob works',exact:true}).click();
    await page.getByRole('option',{name:/^this computer/}).click();
    await page.screenshot({path:dir+'/creation-mixed.png',scale:'css',animations:'disabled'});
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(840,660));
    await page.screenshot({path:dir+'/creation-narrow.png',scale:'css',animations:'disabled'});
    await page.locator('.pickbar').evaluate(element=>element.scrollTop=element.scrollHeight);
    await page.getByText('Set up sandboxes',{exact:true}).click();
    await page.getByRole('button',{name:'set up sandboxes',exact:true}).scrollIntoViewIfNeeded();
    await page.screenshot({path:dir+'/creation-narrow-setup.png',scale:'css',animations:'disabled'});
    if(!await page.getByRole('button',{name:'Create the team',exact:true}).isVisible())throw Error('Create button inaccessible');
    await page.getByRole('button',{name:'Create the team',exact:true}).click();
    const spec=await app.evaluate(()=>globalThis.machineUiSpec);
    assert.deepEqual(spec.defaultMachine,{kind:'box',limits:{maxCpus:2,maxMemoryBytes:4*1024**3}});
    assert.deepEqual(spec.memberMachines,{'profile-1':{kind:'local'}});
    console.log('Mixed placement submission verified.');
  } catch(error) { console.error(error);process.exitCode=1; } finally { const child=app.process();const timer=setTimeout(()=>child.kill('SIGTERM'),5000);try{await app.close();}finally{clearTimeout(timer);} }
})().catch(e=>{console.error(e);process.exitCode=1;});
