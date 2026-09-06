import { execFile } from 'node:child_process';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { SkillInput } from './types.js';
import { discoverSkills, skillName } from './skill-package.js';
import { exists, readRegular } from './catalogue-files.js';

export interface SkillRepository { readonly url: string; readonly ref?: string; readonly skill?: string; }

/** Only known URL shapes are resolved; pasted commands are never executed. */
export function resolveSkillRepository(input: Extract<SkillInput, { kind: 'git' }>): SkillRepository {
  let value = input.url.trim(), skill: string | undefined;
  if (/^[\w.-]+\/[\w.-]+$/.test(value)) value = `https://github.com/${value}.git`;
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Paste a Git HTTPS repository URL, owner/repository, or a skills.sh skill link.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || /\s/.test(value)) throw new Error('Use a public Git HTTPS URL without credentials. Import private repositories from a local clone.');
  if (url.hostname === 'skills.sh' || url.hostname === 'www.skills.sh') {
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length !== 3 || parts.some((part) => !/^[\w.-]+$/.test(part))) throw new Error('Use a skills.sh skill link, or paste its Git repository URL.');
    skill = skillName(parts[2]!);
    url = new URL(`https://github.com/${parts[0]}/${parts[1]}.git`);
  }
  if (url.hostname === 'github.com' && !/^\/[^/]+\/[^/]+\/?$/.test(url.pathname) || url.pathname.includes('/-/tree/') || url.pathname === '/') throw new Error('Paste the repository URL. Enter its branch or tag in Revision.');
  if (/%2f|%5c|%00/i.test(url.pathname) || url.pathname.includes('\\')) throw new Error('Invalid repository URL.');
  const ref = input.ref?.trim();
  if (ref && (!/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(ref) || ref.includes('..') || ref.includes('//') || ref.endsWith('/') || ref.endsWith('.') || ref.endsWith('.lock'))) throw new Error('Use a branch, tag, or commit as the revision.');
  return { url: url.href.replace(/\/$/, ''), ...(ref ? { ref } : {}), ...(skill ? { skill } : {}) };
}

/** Fresh Git state: no user config, helpers, filters, hooks, submodules or shell. */
export async function fetchSkillRepository(repository: SkillRepository): Promise<{ path: string; commit: string; dispose: () => Promise<void> }> {
  const path = await realpath(await mkdtemp(join(tmpdir(), 'blobot-skill-source-')));
  const dispose = () => rm(path, { recursive: true, force: true });
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')));
  Object.assign(env, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: '/usr/bin/false', SSH_ASKPASS: '/usr/bin/false' });
  const run = async (args: string[]) => (await promisify(execFile)('git', [
    '-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-c', 'core.attributesFile=/dev/null',
    '-c', 'credential.helper=', '-c', 'protocol.allow=never', '-c', 'protocol.https.allow=always', ...args,
  ], { cwd: path, env, timeout: 60_000, maxBuffer: 1024 * 1024 })).stdout.trim();
  try {
    await run(['init', '--quiet', '--template=']);
    await run(['fetch', '--quiet', '--depth=1', '--no-tags', '--', repository.url, repository.ref ?? 'HEAD']);
    const commit = await run(['rev-parse', 'FETCH_HEAD']);
    if (!/^[a-f0-9]{40,64}$/.test(commit)) throw new Error('The repository did not resolve to a commit.');
    const tree = await run(['ls-tree', '-r', '-l', commit]);
    const entries = tree.split('\n');
    const bytes = entries.reduce((total, line) => total + Number(/^\d+ blob [a-f0-9]+\s+(\d+)\t/.exec(line)?.[1] ?? 0), 0);
    if (entries.length > 16_384 || bytes > 128 * 1024 * 1024) throw new Error('Choose a smaller repository.');
    await run(['checkout', '--quiet', '--detach', commit]);
    // Repository-level attribution travels with each standalone package too.
    const notices = new Map<string, string>();
    for (const name of ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'COPYING', 'NOTICE']) {
      if (await exists(join(path, name))) notices.set(name, await readRegular(join(path, name), 1024 * 1024));
    }
    if (notices.size > 0) for (const skill of await discoverSkills(path)) {
      for (const [name, text] of notices) if (!await exists(join(skill, name))) await writeFile(join(skill, name), text, { flag: 'wx' });
    }
    return { path, commit, dispose };
  } catch { await dispose(); throw new Error('Could not download this public Git repository or revision. Check the URL, or import a local clone.'); }
}
