import { describe, expect, it } from 'vitest';
import {
  CODEX_EXPRESSES_TRUST,
  CODEX_POSTURE_MODE,
  codexModeFor,
  codexPostureEnv,
} from './permissions.js';
import type { TrustLevel } from '../../trust.js';

const LEVELS: readonly TrustLevel[] = ['careful', 'normal', 'trusting'];

describe('what blobot vouches for on a Codex session', () => {
  it('is one posture at every trust level, and says so rather than implying three', () => {
    for (const trust of LEVELS) expect(codexModeFor(trust)).toBe('read-only');
    expect(CODEX_EXPRESSES_TRUST).toBe(false);
  });

  /**
   * The two neighbouring modes are the two blobot refuses, and for opposite reasons: `agent`
   * wrote to the home directory without asking once, and `agent-full-access` is
   * `bypassPermissions` in another spelling. Neither may appear as an answer here, ever.
   */
  it('never answers with the mode under the floor or the one over the ceiling', () => {
    for (const trust of LEVELS) {
      expect(codexModeFor(trust)).not.toBe('agent');
      expect(codexModeFor(trust)).not.toBe('agent-full-access');
    }
  });

  /**
   * The posture is the child's environment, because the mode wins over `CODEX_CONFIG` and a
   * config key that does nothing is a claim the next reader will believe.
   */
  it('travels as INITIAL_AGENT_MODE and not as a config key', () => {
    expect(codexPostureEnv('normal')).toEqual({ INITIAL_AGENT_MODE: CODEX_POSTURE_MODE });
    expect(Object.keys(codexPostureEnv('trusting'))).toEqual(['INITIAL_AGENT_MODE']);
  });
});
