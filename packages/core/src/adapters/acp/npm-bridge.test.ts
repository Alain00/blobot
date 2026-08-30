import { afterEach, describe, expect, it } from 'vitest';
import { CLAUDE_BRIDGE } from '../claude/stdio-bridge.js';
import { bridgeEntryPathOf, resolveBridgeExecutable, type NpmBridgeSpec } from './npm-bridge.js';

/**
 * The generalisation is only worth anything if the Claude spec still says exactly what the
 * hand-written version said, so the assertions here are against `CLAUDE_BRIDGE` wherever the
 * old code had a literal, and against an invented spec wherever the point is that a second
 * runtime gets the same treatment under different names.
 */
describe('a pinned npm ACP bridge', () => {
  const invented: NpmBridgeSpec = {
    package: '@example/some-acp',
    version: '9.9.9',
    entry: 'dist/index.js',
    overrideEnv: 'BLOBOT_TEST_BRIDGE',
    binary: 'nothing-is-called-this',
    executableEnv: 'BLOBOT_TEST_EXECUTABLE',
    agent: 'Example',
    install: 'the Example CLI',
  };

  const touched = [invented.overrideEnv, invented.executableEnv];
  afterEach(() => {
    for (const key of touched) delete process.env[key];
  });

  it('resolves the pinned dependency on disk, and never through the network', () => {
    // The real pin, resolved the way a spawn resolves it. `npx` would have been a first run
    // that stalls on a fetch.
    const entry = bridgeEntryPathOf(CLAUDE_BRIDGE);
    expect(entry.endsWith('/dist/index.js')).toBe(true);
    expect(entry).toContain(CLAUDE_BRIDGE.package);
  });

  it('takes the override ahead of the dependency, which is how packaging will point it', () => {
    process.env[invented.overrideEnv] = '/somewhere/dist/index.js';
    expect(bridgeEntryPathOf(invented)).toBe('/somewhere/dist/index.js');
    // Empty is not an answer: an unset variable and one set to nothing are the same intent.
    process.env[invented.overrideEnv] = '';
    expect(() => bridgeEntryPathOf(invented)).toThrow();
  });

  it('names the package, the pin, the override and everything it tried when it cannot', () => {
    let message = '';
    try {
      bridgeEntryPathOf(invented);
    } catch (error) {
      message = error instanceof Error ? error.message : '';
    }
    expect(message).toContain('@example/some-acp@9.9.9');
    expect(message).toContain('no Example agent can start');
    expect(message).toContain('BLOBOT_TEST_BRIDGE');
    expect(message).toContain('Tried:');
  });

  it('prefers an explicit binary, then the variable the bridge itself reads, then PATH', () => {
    expect(resolveBridgeExecutable(invented, '/usr/bin/true')).toBe('/usr/bin/true');
    process.env[invented.executableEnv] = '/usr/bin/true';
    expect(resolveBridgeExecutable(invented)).toBe('/usr/bin/true');
    // A named binary that is not there is an error and not a fall-through to PATH: the user
    // said which one to run, and running a different one silently is the failure that
    // pointing the bridge at the user's own install exists to prevent.
    expect(() => resolveBridgeExecutable(invented, '/nowhere/at/all')).toThrow(
      'nothing-is-called-this executable not found at /nowhere/at/all',
    );
  });

  it('tells the user to install the CLI, by the name they would go looking for', () => {
    expect(() => resolveBridgeExecutable(invented)).toThrow(
      'nothing-is-called-this was not found on PATH. Install the Example CLI, or set ' +
        'BLOBOT_TEST_EXECUTABLE to its path.',
    );
  });
});
