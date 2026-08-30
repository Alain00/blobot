import { describe, expect, it } from 'vitest';
import type { PendingPermission } from '@blobot/core';
import { choicesOf } from './permission-choices.js';

const asking = (options: PendingPermission['options']): PendingPermission => ({
  id: 'perm_1',
  agentId: 'alice',
  toolCallId: 'tool_1',
  title: 'mcp__linear__create_issue',
  options,
});

describe('the answers blobot offers', () => {
  /** The three a real `claude` sends, in the order the bridge sends them. */
  it('picks each of the three out by kind, never by the provider name', () => {
    const choices = choicesOf(
      asking([
        { optionId: 'reject', kind: 'reject_once', name: 'Deny' },
        { optionId: 'allow', kind: 'allow_once', name: 'Allow Once' },
        { optionId: 'allow_always', kind: 'allow_always', name: 'Always Allow' },
      ]),
    );
    expect(choices).toEqual({
      allowOptionId: 'allow',
      allowAlwaysOptionId: 'allow_always',
      rejectOptionId: 'reject',
    });
  });

  it('offers no standing rule on a runtime that does not have one', () => {
    const choices = choicesOf(
      asking([
        { optionId: 'once', kind: 'allow_once', name: 'Allow once' },
        { optionId: 'no', kind: 'reject_once', name: 'Reject' },
      ]),
    );
    expect(choices.allowAlwaysOptionId).toBeUndefined();
    expect(choices.allowOptionId).toBe('once');
  });

  it('falls back to refusing forever when that is the only refusal there is', () => {
    const choices = choicesOf(asking([{ optionId: 'never', kind: 'reject_always', name: 'Never' }]));
    expect(choices.rejectOptionId).toBe('never');
    expect(choices.allowOptionId).toBeUndefined();
  });
});
