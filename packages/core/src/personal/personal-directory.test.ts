import { mkdtemp, mkdir, readFile, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { LocalMachine } from '../machines/local-machine.js';
import { PersonalDirectories, PERSONAL_DIRECTORY_MARKER } from './personal-directory.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function storage() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'blobot-personal-'))); roots.push(root);
  return new PersonalDirectories(join(root, 'profiles'));
}

it('reuses one folder across simultaneous memberships, process restarts and profile renames', async () => {
  const store = await storage();
  const [a, b] = await Promise.all([store.forProfile('ana').prepare(), store.forProfile('ana').prepare()]);
  expect(a).toEqual(b);
  await writeFile(join(a.path, 'analysis.cjs'), 'console.log("trained utility");', { mode: 0o700 });
  const reopened = await new PersonalDirectories(store.root).forProfile('ana').prepare();
  expect(reopened).toEqual(a); // Names, teams and runtimes do not participate in this identity.
  expect(await readFile(join(reopened.path, 'analysis.cjs'), 'utf8')).toBe('console.log("trained utility");');
  const other = await store.forProfile('bea').prepare();
  expect(other.path).not.toBe(a.path);
  await expect(readFile(join(other.path, 'analysis.cjs'))).rejects.toMatchObject({ code: 'ENOENT' });
});

it.each(['missing', 'symlink', 'replacement', 'marker'] as const)('refuses a %s folder without recreating or adopting personal data', async kind => {
  const store = await storage(), personal = store.forProfile('ana'), reference = await personal.prepare();
  await writeFile(join(reference.path, 'keep.txt'), 'original');
  const original = `${reference.path}-saved`;
  if (kind === 'marker') {
    await rm(join(reference.path, PERSONAL_DIRECTORY_MARKER));
    await symlink(join(reference.path, 'keep.txt'), join(reference.path, PERSONAL_DIRECTORY_MARKER));
  } else {
    await rename(reference.path, original);
    if (kind === 'symlink') await symlink(original, reference.path);
    if (kind === 'replacement') await mkdir(reference.path);
  }
  await expect(new PersonalDirectories(store.root).forProfile('ana').prepare()).rejects.toThrow('unavailable or changed');
  expect(await readFile(join(kind === 'marker' ? reference.path : original, 'keep.txt'), 'utf8')).toBe('original');
  if (kind === 'missing') await expect(readFile(reference.path)).rejects.toMatchObject({ code: 'ENOENT' });
});

it('preserves a partially initialized owner for recovery, and rejects path-like profile ids', async () => {
  const store = await storage();
  await mkdir(join(store.root, 'ana'), { recursive: true });
  await writeFile(join(store.root, 'ana', 'retained'), 'partial');
  await expect(store.forProfile('ana').prepare()).rejects.toThrow('ownership needs recovery');
  expect(await readFile(join(store.root, 'ana', 'retained'), 'utf8')).toBe('partial');
  for (const id of ['', '../ana', 'team/ana', 'Ana', 'a'.repeat(97)]) expect(() => store.forProfile(id)).toThrow();
});

it.each(['profile', 'storage'] as const)('detects a lost whole %s directory after service reconstruction without creating a replacement', async kind => {
  const store = await storage(), reference = await store.forProfile('ana').prepare();
  await writeFile(join(reference.path, 'retained'), 'trained');
  const lost = kind === 'profile' ? dirname(reference.path) : store.root;
  await rename(lost, `${lost}-saved`);
  await expect(new PersonalDirectories(store.root).forProfile('ana').prepare()).rejects.toThrow('unavailable or changed');
  await expect(readFile(lost)).rejects.toMatchObject({ code: 'ENOENT' });
  const savedFile = kind === 'profile' ? join(`${lost}-saved`, 'files', 'retained') : join(`${lost}-saved`, 'ana', 'files', 'retained');
  expect(await readFile(savedFile, 'utf8')).toBe('trained');
});

it('refuses lost or replaced ownership receipts instead of adopting a new identity', async () => {
  const store = await storage(), personal = store.forProfile('ana'), reference = await personal.prepare();
  const receipt = join(`${store.root}.records`, 'ana.json');
  await rm(receipt);
  await expect(personal.prepare()).rejects.toThrow('ownership needs recovery');
  await expect(new PersonalDirectories(store.root).forProfile('ana').prepare()).rejects.toThrow('ownership needs recovery');
  const replaced = { ...reference, identity: '11111111-1111-1111-1111-111111111111' };
  await writeFile(receipt, JSON.stringify(replaced));
  await writeFile(join(reference.path, PERSONAL_DIRECTORY_MARKER), replaced.identity);
  await expect(personal.prepare()).rejects.toThrow('unavailable or changed');
});

it('lets local memberships run the same utility through their own process environment and keeps it after removal', async () => {
  const store = await storage();
  const cwd = roots.at(-1)!;
  const first = new LocalMachine({ agentId: 'ana-contab', workspacePath: cwd }, { personalDirectory: store.forProfile('ana') });
  const second = new LocalMachine({ agentId: 'ana-blue', workspacePath: cwd }, { personalDirectory: store.forProfile('ana') });
  await Promise.all([first.start({ mailboxPort: 1234 }), second.start({ mailboxPort: 1234 })]);
  const command = async (machine: LocalMachine, source: string) => {
    const channel = machine.spawn({ cwd, command: { kind: 'exec', executable: process.execPath, args: ['-e', source] },
      env: { BLOBOT_PERSONAL_DIR: '/wrong-profile' } });
    const lines = [];
    for await (const line of channel.lines()) lines.push(line);
    await channel.close();
    return lines;
  };
  await command(first, 'require("node:fs").writeFileSync(process.env.BLOBOT_PERSONAL_DIR+"/utility.cjs", "console.log(42)")');
  expect(await command(second, 'require(process.env.BLOBOT_PERSONAL_DIR+"/utility.cjs")')).toEqual(['42']);
  await first.stop(); await first.destroy();
  expect(await command(second, 'require(process.env.BLOBOT_PERSONAL_DIR+"/utility.cjs")')).toEqual(['42']);
  await rm(first.location().personalPath!, { recursive: true });
  await expect(second.beforeWork()).rejects.toThrow('unavailable or changed');
  await second.stop();
});
