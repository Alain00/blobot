// Renderer interaction fixture. Loads the built app with a synthetic preload, never production main.
// Run from apps/desktop: env -u ELECTRON_RUN_AS_NODE node_modules/.bin/electron ../../.scratch/machines/research/45-individual-team-ui-fixture.cjs
const { app, BrowserWindow } = require('electron');
const {writeFile,mkdtemp}=require('node:fs/promises');
const {tmpdir}=require('node:os');
const path=require('node:path');
const output=require('node:fs').mkdtempSync(path.join(tmpdir(),'blobot-individual-ui-'));
app.setPath('userData',path.join(output,'user-data'));
process.stdout.write('Fixture output: '+output+'\n');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let win;
async function evaluate(js){return win.webContents.executeJavaScript(js);}
async function waitFor(js){for(let n=0;n<100;n++){if(await evaluate(js))return;await pause(50);}throw new Error('Timed out: '+js);}
async function capture(name){await pause(250);await writeFile(path.join(output,name+'.png'),(await win.webContents.capturePage()).toPNG());}
function click(text){return evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`);}
app.whenReady().then(async()=>{try{
 win=new BrowserWindow({width:1360,height:828,webPreferences:{preload:path.join(__dirname,'45-individual-team-ui-preload.cjs'),contextIsolation:true}});
 win.webContents.on('console-message',(event)=>process.stdout.write(String(event.message)+'\n'));
 await win.loadFile(path.resolve(__dirname,'../../../apps/desktop/out/renderer/index.html'),{hash:'screen=agents&silent=1'});
 await waitFor(`!!document.querySelector('[aria-label="Talk with Mara"]')`);
 await capture('agents');
 await evaluate(`document.querySelector('[aria-label="Talk with Mara"]').click()`);
 await waitFor(`!!document.querySelector('[role="dialog"]')`);
 await capture('chooser');
 win.setContentSize(760,720);await capture('chooser-narrow');
 if(!(await evaluate('document.documentElement.scrollWidth <= innerWidth'))) throw new Error('Horizontal overflow');
 win.setContentSize(1360,800);
 await click('new individual team');
 await waitFor(`!!document.querySelector('.pickinput')`);
 await capture('new-team');
 if((await evaluate('window.blobot.fixtureCalls()')).length!==0) throw new Error('Mutation before creation');
 win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});
 await waitFor(`!!document.querySelector('[aria-label="Talk with Mara"]')`);
 await evaluate(`document.querySelector('[aria-label="Talk with Mara"]').click()`);
 await evaluate(`Array.from(document.querySelectorAll('[role="dialog"] button')).find(b=>b.textContent.trim()==='Planning with Mara').click()`);
 await waitFor(`!document.querySelector('.agentspage') && !document.querySelector('[role="dialog"]')`);
 await capture('continued');
 const calls=await evaluate('window.blobot.fixtureCalls()');
 if(calls.length!==1 || calls[0].method!=='selectIndividualTeam'||calls[0].profileId!=='mara-profile'||calls[0].teamId!=='solo')throw new Error('Wrong target '+JSON.stringify(calls));
 await writeFile(path.join(output,'results.json'),JSON.stringify({passed:true,calls},null,2));
 app.exit(0);
}catch(error){process.stderr.write(error.stack+'\n');if(win)await capture('failure');app.exit(1);}});
