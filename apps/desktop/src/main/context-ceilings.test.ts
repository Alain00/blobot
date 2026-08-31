import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqliteStore, openDatabase, type AgentProfileRecord, type OpenedDatabase } from '@blobot/core';
import { ceilingIsSane, ceilingRows, resolveCeiling } from './context-ceilings.js';

/**
 * Two sources for one number, and an order between them. What is under test is that order, the
 * rows the settings screen is built out of, and the one case a table alone cannot answer: a
 * runtime that advertises no model to choose.
 *
 * The tables are passed in rather than imported, so a change to what blobot ships for Opus does
 * not fail a test about precedence.
 */

const migrationsFolder = fileURLToPath(
  new URL('../../../../packages/core/migrations', import.meta.url),
);

const TABLES = { 'claude-code': { opus: 300_000 }, codex: {}, opencode: {} };

let opened: OpenedDatabase;
let store: SqliteStore;

const profile = (
  name: string,
  runtimeId: string,
  model?: string,
): AgentProfileRecord =>
  store.createProfile({
    id: `p_${name}`,
    name,
    role: 'reviewer',
    runtimeId,
    ...(model === undefined ? {} : { runtimeOptions: { model } }),
    createdAt: 1,
  });

beforeEach(() => {
  opened = openDatabase({ path: ':memory:', migrationsFolder });
  store = new SqliteStore(opened.db);
});

afterEach(() => opened.close());

describe('resolving one model', () => {
  it('falls to the adapter table when the user has set nothing', () => {
    expect(resolveCeiling([], 'claude-code', 'opus')).toBe(300_000);
  });

  it('answers nothing for a model nobody has established, which is the ordinary case', () => {
    expect(resolveCeiling([], 'opencode', 'anthropic/claude-sonnet-4')).toBeUndefined();
  });

  it("prefers the user's number over the one blobot ships", () => {
    store.setContextCeiling('claude-code', 'opus', 420_000, 1);
    expect(resolveCeiling(store.contextCeilings(), 'claude-code', 'opus')).toBe(420_000);
  });

  it('holds a number for a runtime that advertises no model, which is the only key Codex has', () => {
    store.setContextCeiling('codex', undefined, 180_000, 1);
    expect(resolveCeiling(store.contextCeilings(), 'codex', undefined)).toBe(180_000);
    // And it is not the same key as a model that happens to be named: an agent that chose one
    // is a different agent from one that let the runtime pick.
    expect(resolveCeiling(store.contextCeilings(), 'codex', 'gpt-5.4')).toBeUndefined();
  });

  it('is taken back by clearing it, falling to what blobot knew before', () => {
    store.setContextCeiling('claude-code', 'opus', 420_000, 1);
    store.clearContextCeiling('claude-code', 'opus');
    expect(resolveCeiling(store.contextCeilings(), 'claude-code', 'opus')).toBe(300_000);
  });
});

describe('the rows the screen is built from', () => {
  it('lists a model per hired agent, and says who is on it', () => {
    profile('Alice', 'claude-code', 'opus');
    profile('Bob', 'claude-code', 'opus');
    profile('Cass', 'codex');
    const rows = ceilingRows([], store.listProfiles(), TABLES);
    expect(rows.map((row) => [row.runtimeId, row.model, row.used])).toEqual([
      ['claude-code', 'opus', ['Alice', 'Bob']],
      ['codex', undefined, ['Cass']],
    ]);
  });

  it('carries where each number came from, and no number at all for the fallback', () => {
    profile('Alice', 'claude-code', 'opus');
    profile('Cass', 'codex');
    const rows = ceilingRows([], store.listProfiles(), TABLES);
    expect(rows[0]).toMatchObject({ tokens: 300_000, source: 'measured' });
    expect(rows[1]?.source).toBe('unmeasured');
    expect(rows[1]?.tokens).toBeUndefined();
  });

  it("shows a table entry nobody is hired on, so a number blobot decided is visible first", () => {
    const rows = ceilingRows([], [], TABLES);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ model: 'opus', used: [], source: 'measured' });
  });

  it('keeps a row for a ceiling the user set on a model no agent uses any more', () => {
    store.setContextCeiling('opencode', 'zed-industries/omni', 90_000, 1);
    const rows = ceilingRows(store.contextCeilings(), [], TABLES);
    expect(rows.map((row) => [row.model, row.tokens, row.source])).toContainEqual([
      'zed-industries/omni',
      90_000,
      'yours',
    ]);
  });
});

describe('what will be stored', () => {
  it('refuses a figure that is not a token count', () => {
    expect(ceilingIsSane(0)).toBe(false);
    expect(ceilingIsSane(2_000.5)).toBe(false);
    expect(ceilingIsSane(50_000_000)).toBe(false);
    expect(ceilingIsSane(300_000)).toBe(true);
  });
});
