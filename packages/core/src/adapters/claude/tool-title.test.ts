import { describe, expect, it } from 'vitest';
import type { InjectableEvent } from '../../mock/mock-agent-runtime.js';
import { withoutToolVerb } from './tool-title.js';

const started = (title: string): InjectableEvent => ({
  type: 'tool_call_started',
  toolCallId: 'call_1',
  title,
  kind: 'edit',
});

describe('a title that repeats the verb beside it', () => {
  const meta = (toolName: string): { _meta: { claudeCode: { toolName: string } } } => ({
    _meta: { claudeCode: { toolName } },
  });

  it('drops the provider\'s verb, leaving the target the column is for', () => {
    expect(withoutToolVerb(started('Edit notes.txt'), meta('Edit'))).toMatchObject({
      title: 'notes.txt',
    });
    expect(withoutToolVerb(started('Write src/desk.tsx'), meta('Write'))).toMatchObject({
      title: 'src/desk.tsx',
    });
  });

  it('leaves a title that is only the verb, since nothing would be left', () => {
    expect(withoutToolVerb(started('Edit'), meta('Edit'))).toMatchObject({ title: 'Edit' });
  });

  it('strips only the name the provider confirmed, never a capitalised first word', () => {
    // A bash call whose command happens to start with a word: nothing is taken off it.
    expect(withoutToolVerb(started('Edit the config by hand'), meta('Bash'))).toMatchObject({
      title: 'Edit the config by hand',
    });
    expect(withoutToolVerb(started('npm run build'), meta('Bash'))).toMatchObject({
      title: 'npm run build',
    });
  });

  it('leaves an update with no title and events that are not tool calls alone', () => {
    const noTitle: InjectableEvent = {
      type: 'tool_call_updated',
      toolCallId: 'call_1',
      status: 'completed',
    };
    expect(withoutToolVerb(noTitle, meta('Edit'))).toBe(noTitle);
    const delta: InjectableEvent = {
      type: 'agent_message_delta',
      messageId: 'm',
      text: 'Edit this',
    };
    expect(withoutToolVerb(delta, meta('Edit'))).toBe(delta);
  });

  it('does nothing when the provider sent no name, which is every other runtime', () => {
    expect(withoutToolVerb(started('Edit notes.txt'), {})).toMatchObject({
      title: 'Edit notes.txt',
    });
  });
});
