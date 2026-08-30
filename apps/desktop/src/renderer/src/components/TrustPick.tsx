import * as Select from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import React from 'react';
import type { TrustLevel } from '../../../shared/api.js';

/**
 * What this agent may do in its own copy before its runtime starts asking.
 *
 * Three positions and no more. The step above `trusting` is Claude's `bypassPermissions` or
 * OpenCode's unqualified allow, and ticket 14 refuses both, so the control has no fourth row
 * for the same reason the runtime options menu has no `mode` group.
 *
 * The one control in this app whose words are blobot's own rather than a provider's. Everything
 * else in the agent form either prints a label the runtime gave it or sends back an opaque id;
 * these three mean the same thing on both runtimes *because* the adapters translate them
 * differently, which is the permanent rule pointing the way it usually does not.
 *
 * A select and not three radios: it is one decision with one answer, it sits in a column of
 * fields that are all `.field`, and a beginner should be able to read the consequence without
 * opening anything. The sentence under the trigger is the whole of the friendliness budget.
 */

interface Level {
  readonly id: TrustLevel;
  readonly word: string;
  readonly says: string;
}

/**
 * The copy. Written for somebody who has never thought about this, which rules out the words
 * that would make it precise: no tool names, no shell prefixes, no runtime.
 *
 * `normal` does not say "recommended" and is not marked. It is the one that is already selected,
 * which says it better than a badge would, and a badge here would imply the other two are
 * mistakes.
 */
const LEVELS: readonly Level[] = [
  {
    id: 'careful',
    word: 'careful',
    says: 'Asks before every edit and every command.',
  },
  {
    id: 'normal',
    word: 'normal',
    says: 'Edits files and runs ordinary commands in its own copy. Asks about the rest.',
  },
  {
    id: 'trusting',
    word: 'trusting',
    says:
      'Also installs packages and fetches from the network. Still asks before deleting, ' +
      'publishing, or changing who can do what.',
  },
];

export function TrustPick({
  value,
  onChange,
}: {
  value: TrustLevel;
  onChange: (value: TrustLevel) => void;
}): React.JSX.Element {
  const current = LEVELS.find((level) => level.id === value) ?? LEVELS[1];
  return (
    <>
      <Select.Root value={value} onValueChange={(next) => onChange(next as TrustLevel)}>
        <Select.Trigger className="field selecttrigger" aria-label="What it can do without asking">
          <Select.Value className="selectvalue" />
          <Select.Icon>
            <ChevronDown size={14} aria-hidden />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content className="selectmenu" position="popper" sideOffset={6}>
            <Select.Viewport>
              {LEVELS.map((level) => (
                <Select.Item key={level.id} value={level.id} className="selectitem trustitem">
                  <Select.ItemText>{level.word}</Select.ItemText>
                  <Select.ItemIndicator className="selecttick">
                    <Check size={13} aria-hidden />
                  </Select.ItemIndicator>
                  {/* Outside `ItemText`, so the trigger shows the word alone: the sentence is
                      what you read while choosing, and the line under the trigger is what you
                      read afterwards. */}
                  <span className="trustsays">{level.says}</span>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
      {/* The same sentence, under the closed control, for the same reason the runtime picker
          keeps its readiness line: a form should say what it is set to without being opened. */}
      <span className="note muted">{(current as Level).says}</span>
    </>
  );
}
