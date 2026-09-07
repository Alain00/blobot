import { expect, it } from 'vitest';
import { invokeAction } from './invoke.js';

it('carries the actionable refusal without Electron transport metadata', async () => {
  await expect(invokeAction(async () => { throw new Error("Error invoking remote method 'blobot:answerMachineLogin': Error: Choose one of the listed options."); }))
    .rejects.toThrow(/^Choose one of the listed options\.$/);
  await expect(invokeAction(async () => { throw new Error('The working folder is missing.'); }))
    .rejects.toThrow(/^The working folder is missing\.$/);
  await expect(invokeAction(async () => 'done')).resolves.toBe('done');
});
