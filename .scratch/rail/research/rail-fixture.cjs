// Loads the built renderer with the synthetic preload beside this file and captures the rail.
// Run from apps/desktop:
//   env -u ELECTRON_RUN_AS_NODE node_modules/.bin/electron ../../.scratch/rail/research/rail-fixture.cjs
const { app, BrowserWindow } = require('electron');
const { writeFile } = require('node:fs/promises');
const path = require('node:path');
const output = process.env['RAIL_FIXTURE_OUT'] ?? require('node:fs').mkdtempSync(path.join(require('node:os').tmpdir(), 'blobot-rail-'));
app.setPath('userData', path.join(output, 'user-data'));
process.stdout.write('Fixture output: ' + output + '\n');
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({ width: 1360, height: 828, webPreferences: {
      preload: path.join(__dirname, 'rail-fixture-preload.cjs'), contextIsolation: true,
    } });
    win.webContents.on('console-message', (event) => process.stdout.write(String(event.message) + '\n'));
    await win.loadFile(path.resolve(__dirname, '../../../apps/desktop/out/renderer/index.html'));
    for (let n = 0; n < 100; n += 1) {
      if (await win.webContents.executeJavaScript(`document.querySelectorAll('.railrow').length >= 6`)) break;
      await pause(50);
    }
    await pause(400);
    await writeFile(path.join(output, 'rail.png'), (await win.webContents.capturePage()).toPNG());
    // And with two rows pinned, so the block and its hairline are on screen.
    await win.webContents.executeJavaScript(
      `localStorage.setItem('blobot.railPins', JSON.stringify(['notes','p_nils'])); location.reload();`,
    );
    for (let n = 0; n < 100; n += 1) {
      if (await win.webContents.executeJavaScript(`document.querySelectorAll('.railpinline').length === 1`)) break;
      await pause(50);
    }
    await pause(400);
    await writeFile(path.join(output, 'rail-pinned.png'), (await win.webContents.capturePage()).toPNG());
    process.stdout.write('captured\n');
  } catch (error) {
    process.stderr.write(String(error) + '\n');
    process.exitCode = 1;
  } finally {
    app.quit();
  }
});
