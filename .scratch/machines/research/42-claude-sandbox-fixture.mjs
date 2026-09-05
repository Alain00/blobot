// Synthetic config/argument probe. No user message, inference, login or real credential.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const requireCore = createRequire(join(repo, 'packages/core/package.json'));
const bridgePath = requireCore.resolve('@agentclientprotocol/claude-agent-acp/dist/lib.js');
const sdkPath = createRequire(bridgePath).resolve('@anthropic-ai/claude-agent-sdk');
const cliPath = '/Users/guillermo/.local/share/claude/versions/2.1.260';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const cleanEnv = root => ({
  PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
  LANG: 'en_US.UTF-8',
  CLAUDE_CONFIG_DIR: join(root, 'config'),
  CLAUDE_CODE_TMPDIR: join(root, 'tmp'),
  TMPDIR: join(root, 'tmp'),
  ANTHROPIC_API_KEY: 'sk-ant-synthetic-fixture-not-a-real-key',
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
  DISABLE_AUTOUPDATER: '1',
  DISABLE_TELEMETRY: '1',
  DISABLE_ERROR_REPORTING: '1',
});
const profile = `(version 1)
(allow default)
(deny network*)
(deny file-read*
  (subpath "/Users/guillermo/.claude")
  (literal "/Users/guillermo/.claude.json")
  (subpath "/Users/guillermo/Library/Keychains")
  (subpath "/Library/Keychains")
  (subpath "/Library/Application Support/ClaudeCode")
  (subpath "/Library/Managed Preferences"))
(deny mach-lookup (global-name "com.apple.securityd"))`;
const policy = {
  enabled: true, failIfUnavailable: true,
  autoAllowBashIfSandboxed: false, allowUnsandboxedCommands: false,
  network: { allowLocalBinding: true },
};
const tiers = {
  user: { sandbox: { enabled: false, autoAllowBashIfSandboxed: true,
    excludedCommands: ['user-synthetic *', 'shared-synthetic *'],
    network: { allowedDomains: ['user.invalid'] }, filesystem: { allowRead: ['/synthetic/user'] } },
    permissions: { defaultMode: 'default', allow: ['Bash(user-synthetic:*)'] } },
  project: { sandbox: { enabled: true, failIfUnavailable: false,
    autoAllowBashIfSandboxed: true, allowUnsandboxedCommands: true,
    excludedCommands: ['project-synthetic *', 'shared-synthetic *'],
    network: { allowedDomains: ['project.invalid'] }, filesystem: { allowRead: ['/synthetic/project'] } },
    permissions: { allow: ['Bash(project-synthetic:*)'], ask: ['Bash(*)'] } },
  local: { sandbox: { enabled: true, excludedCommands: ['local-synthetic *'],
    network: { allowedDomains: ['local.invalid'] }, filesystem: { allowRead: ['/synthetic/local'] } },
    permissions: { allow: ['Bash(local-synthetic:*)'] } },
};

async function child(root, mode) {
  const { query, resolveSettings } = await import(pathToFileURL(sdkPath));
  const cwd = join(root, 'project');
  if (mode === 'resolve') {
    const result = await resolveSettings({ cwd, settingSources: ['user', 'project', 'local'] });
    process.stdout.write(JSON.stringify({ effective: result.effective,
      sources: result.sources.map(({ source, settings }) => ({ source, settings })) }));
    return;
  }
  const input = JSON.parse(await readFile(join(root, 'case.json'), 'utf8'));
  let releaseInput;
  const inputDone = new Promise(resolve => { releaseInput = resolve; });
  const prompt = { async *[Symbol.asyncIterator]() { await inputDone; } };
  let childProcess, queryObject, spawnArgs, stderr = '', frames = [], outputTypes = [], forcedCleanup = false;
  let lineBuffer = '', outBuffer = '';
  const base = {
    cwd, pathToClaudeCodeExecutable: cliPath, env: cleanEnv(root),
    settingSources: ['user', 'project', 'local'], permissionMode: 'default',
    allowedTools: ['Bash(adapter-synthetic:*)'], tools: [],
    canUseTool: async () => { throw Error('Unexpected permission callback: no user turn is allowed'); },
    persistSession: false, strictMcpConfig: true, mcpServers: {}, debugFile: join(root, `debug-${mode}.log`),
    ...input.options,
    spawnClaudeCodeProcess(options) {
      spawnArgs = options.args;
      if (mode === 'capture') throw Error('SYNTHETIC_CAPTURE_COMPLETE');
      // Per-process network/credential-read guard, never a global sandbox setting.
      childProcess = mode === 'cli-wrapper-denied'
        ? spawn(options.command, options.args,
          { cwd: options.cwd, env: options.env, stdio: ['pipe', 'pipe', 'pipe'] })
        : spawn('/usr/bin/sandbox-exec', ['-p', profile, options.command, ...options.args],
        { cwd: options.cwd, env: options.env, stdio: ['pipe', 'pipe', 'pipe'] });
      childProcess.stderr.on('data', b => { stderr += b.toString(); });
      childProcess.stdout.on('data', b => {
        outBuffer += b;
        for (;;) {
          const i = outBuffer.indexOf('\n'); if (i < 0) break;
          const line = outBuffer.slice(0, i); outBuffer = outBuffer.slice(i + 1);
          try { const v = JSON.parse(line); outputTypes.push(v.type); } catch {}
        }
      });
      const original = childProcess.stdin.write.bind(childProcess.stdin);
      childProcess.stdin.write = (chunk, ...rest) => {
        lineBuffer += chunk;
        for (;;) {
          const i = lineBuffer.indexOf('\n'); if (i < 0) break;
          const v = JSON.parse(lineBuffer.slice(0, i)); lineBuffer = lineBuffer.slice(i + 1);
          frames.push({ type: v.type, subtype: v.request?.subtype });
          if (v.type === 'user') { childProcess.kill('SIGKILL'); throw Error('User frame forbidden'); }
        }
        return original(chunk, ...rest);
      };
      return childProcess;
    },
  };
  const timeout = setTimeout(() => { childProcess?.kill('SIGKILL'); }, 25000);
  let settings, error;
  try {
    queryObject = query({ prompt, options: base });
    await queryObject.initializationResult();
    settings = await queryObject.getSettings();
  } catch (e) { error = e.message; }
  finally {
    releaseInput(); queryObject?.close();
    if (childProcess && childProcess.exitCode === null && childProcess.signalCode === null) {
      const closeTimeout = setTimeout(() => { forcedCleanup = true; childProcess.kill('SIGKILL'); }, 3000);
      await once(childProcess, 'exit').catch(() => {});
      clearTimeout(closeTimeout);
    }
    clearTimeout(timeout);
  }
  const settingsIndex = spawnArgs?.indexOf('--settings');
  let sandboxDebug = [];
  try { sandboxDebug = (await readFile(join(root, `debug-${mode}.log`), 'utf8')).split('\n')
    .filter(line => /Failed to initialize sandbox|before_sandbox_init|after_sandbox_init|sandbox required but unavailable/.test(line))
    .map(line => line.slice(0, 700)); } catch {}
  process.stdout.write(JSON.stringify({
    mode, args: spawnArgs, argumentSettings: settingsIndex >= 0 ? JSON.parse(spawnArgs[settingsIndex + 1]) : null,
    settings, error, frames, outputTypes, stderr, sandboxDebug, forcedCleanup,
    nativeExitCode: childProcess?.exitCode, nativeExitSignal: childProcess?.signalCode,
  }));
}

if (process.argv[2] === '--child') {
  await child(process.argv[3], process.argv[4]);
} else {
  const root = await mkdtemp(join(tmpdir(), 'blobot-claude42-'));
  let report;
  try {
    for (const sub of ['config', 'tmp', 'project/.claude']) await mkdir(join(root, sub), { recursive: true });
    await writeFile(join(root, 'config/settings.json'), JSON.stringify(tiers.user));
    await writeFile(join(root, 'project/.claude/settings.json'), JSON.stringify(tiers.project));
    await writeFile(join(root, 'project/.claude/settings.local.json'), JSON.stringify(tiers.local));
    const cases = [
      ['capture-local-explicit', 'capture', { sandbox: policy }],
      ['capture-local-default-fail', 'capture', { sandbox: { enabled: true } }],
      ['capture-box-disabled', 'capture', { sandbox: { enabled: false } }],
      ['capture-object-replacement', 'capture', { settings: { env: { SYNTHETIC_KEEP: 'yes' },
        sandbox: { network: { allowedDomains: ['option.invalid'] } } }, sandbox: policy }],
      ['capture-settings-path-rejected', 'capture', { settings: join(root, 'synthetic-settings.json'), sandbox: policy }],
      ['resolve-synthetic-tiers', 'resolve', {}],
      ['cli-box-disabled', 'cli', { sandbox: { enabled: false } }],
      ['cli-local-explicit', 'cli', { sandbox: { ...policy, excludedCommands: [],
        network: { ...policy.network, allowedDomains: ['flag.invalid'] },
        filesystem: { allowRead: ['/synthetic/flag'] } } }],
      ['cli-wrapper-denied-required', 'cli-wrapper-denied', { sandbox: policy }],
      ['cli-wrapper-denied-optional', 'cli-wrapper-denied', { sandbox: { ...policy, failIfUnavailable: false } }],
    ];
    report = { fixture: '42-claude-sandbox', uuid: randomUUID(), createdAt: new Date().toISOString(),
      pins: { cli: '2.1.260', bridge: '0.70.0', sdk: '0.3.232',
        cliSha256: hash(await readFile(cliPath)), sdkSha256: hash(await readFile(sdkPath)) },
      profile, inputTiers: tiers, cases: [], noUserMessage: true };
    for (const [name, mode, options] of cases) {
      await writeFile(join(root, 'case.json'), JSON.stringify({ options }));
      const caseProfile = mode === 'cli-wrapper-denied' ? `${profile}\n(deny process-exec (literal "/usr/bin/sandbox-exec"))\n(deny file-read* (literal "/usr/bin/sandbox-exec"))` : profile;
      const result = spawnSync('/usr/bin/sandbox-exec', ['-p', caseProfile, process.execPath,
        fileURLToPath(import.meta.url), '--child', root, mode],
        { cwd: join(root, 'project'), env: cleanEnv(root), encoding: 'utf8', timeout: 30000, maxBuffer: 8 * 1024 * 1024 });
      let observation;
      try { observation = JSON.parse(result.stdout); } catch { observation = { stdout: result.stdout }; }
      report.cases.push({ name, processStatus: result.status, processError: result.error?.message,
        processStderr: result.stderr, observation });
      console.log(`${name}: process=${result.status} error=${observation.error ?? 'none'}`);
    }
    report.noUserMessage = report.cases.every(c => !c.observation.frames?.some(f => f.type === 'user'));
    assert.equal(report.noUserMessage, true);
    const byName = name => report.cases.find(c => c.name === name).observation;
    const assertions = {
      allChildProcessesCompleted: report.cases.every(c => c.processStatus === 0),
      sdkExplicitPolicy: JSON.stringify(byName('capture-local-explicit').argumentSettings.sandbox) === JSON.stringify(policy),
      sdkDefaultFailClosed: byName('capture-local-default-fail').argumentSettings.sandbox.failIfUnavailable === true,
      sdkDisabledUnchanged: JSON.stringify(byName('capture-box-disabled').argumentSettings.sandbox) === '{"enabled":false}',
      sdkObjectSandboxReplaced: !byName('capture-object-replacement').argumentSettings.sandbox.network.allowedDomains,
      sdkNonSandboxSettingsPreserved: byName('capture-object-replacement').argumentSettings.env.SYNTHETIC_KEEP === 'yes',
      sdkSettingsPathRejected: byName('capture-settings-path-rejected').error.startsWith('Cannot use both'),
      cliFlagFalseWins: byName('cli-box-disabled').settings.effective.sandbox.enabled === false,
      cliRequiredScalarsWin: ['enabled','failIfUnavailable','autoAllowBashIfSandboxed','allowUnsandboxedCommands'].every(k => byName('cli-local-explicit').settings.effective.sandbox[k] === policy[k]),
      cliLoopbackOptionArrives: byName('cli-local-explicit').settings.effective.sandbox.network.allowLocalBinding === true,
      cliDomainArraysMerge: JSON.stringify(byName('cli-local-explicit').settings.effective.sandbox.network.allowedDomains) === JSON.stringify(['user.invalid','project.invalid','local.invalid','flag.invalid']),
      cliReadArraysMerge: byName('cli-local-explicit').settings.effective.sandbox.filesystem.allowRead.length === 4,
      cliEmptyExclusionsDoNotClear: byName('cli-local-explicit').settings.effective.sandbox.excludedCommands.length === 4,
      cliPermissionsCascadeUnaffected: JSON.stringify(byName('cli-box-disabled').settings.effective.permissions) === JSON.stringify(byName('cli-local-explicit').settings.effective.permissions),
      onlyControlRequests: report.cases.every(c => (c.observation.frames ?? []).every(f => f.type === 'control_request' && ['initialize','get_settings'].includes(f.subtype))),
      noUserMessage: report.noUserMessage,
    };
    report.assertions = assertions;
    report.fixturePassed = Object.values(assertions).every(Boolean);
    assert.equal(report.fixturePassed, true);
  } finally {
    await rm(root, { recursive: true, force: true });
    if (report) {
      report.temporaryTreeRemoved = true;
      await writeFile(join(here, '42-claude-sandbox-results.json'), `${JSON.stringify(report, null, 2)}\n`);
    }
  }
}
