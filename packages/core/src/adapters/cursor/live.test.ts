import { describe, expect, it } from 'vitest';

/**
 * Live turns against a real `cursor-agent acp`. Off by default — it costs tokens and needs
 * a signed-in machine, and ticket 01 of `.scratch/cursor-runtime/` (whether
 * `CURSOR_CONFIG_DIR` relocates `mcp.json` without taking the login) has not been run.
 *
 *   BLOBOT_LIVE_CURSOR=1 pnpm --filter @blobot/core exec vitest run src/adapters/cursor/live.test.ts
 *
 * The criterion of done on ticket 06 is two Cursor agents messaging each other through the
 * mailbox. This file exists so that measurement has a place to land; it does not pretend
 * to have been observed.
 */
const live = process.env['BLOBOT_LIVE_CURSOR'] === '1' ? describe : describe.skip;

live('a real cursor-agent', () => {
  it('is not yet observed; enable this suite after ticket 01', () => {
    expect(process.env['BLOBOT_LIVE_CURSOR']).toBe('1');
  });
});
