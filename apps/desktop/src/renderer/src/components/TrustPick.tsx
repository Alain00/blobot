import * as Select from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import React from 'react';
import type { TrustLevel } from '../../../shared/api.js';

/**
 * What this agent may do in its own copy before its runtime starts asking.
 *
 * Four positions where the runtime has a decider of its own and three everywhere else, which is
 * why the rows are handed in rather than hardcoded: `trustLevelsFor` in main is the one place
 * allowed to know what a `runtime_id` means, and a picker that spelled the fourth row itself
 * would be offering `unattended` beside a Codex agent, where it means nothing.
 *
 * The step this control still refuses is `bypassPermissions` and OpenCode's unqualified allow:
 * nothing asks and nothing decides. `unattended` is not that. Something still answers every
 * request; it is the provider's classifier rather than the person, and the sentence on the row
 * says so in those words.
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

export interface Level {
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
/** Exported so the words can be tested as words. They are the control's whole content. */
export const LEVELS: readonly Level[] = [
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
  {
    id: 'unattended',
    word: 'unattended',
    says:
      'The rest is answered by the runtime, not by you, so it works while you are away. ' +
      'Deleting and publishing are refused: nobody can be asked.',
  },
];

/**
 * The rows to draw, given what the runtime can express.
 *
 * A level the runtime does not have is not greyed out, it is absent: a disabled row invites the
 * question *why not*, and the honest answer is about a provider the form is not allowed to name.
 */
export function levelsFor(available: readonly TrustLevel[]): readonly Level[] {
  return LEVELS.filter((level) => available.includes(level.id));
}

/**
 * The sentence is on the menu row and not under the closed control. *2026-08-31.* Three of these
 * stand in a row in the agent form and each carried its explanation permanently on screen, which
 * is three paragraphs of blobot explaining itself around two words the user came to set. The
 * text is unchanged and one keystroke away, on the row it belongs to, where it is read while the
 * choice is being made rather than after it has been.
 */
export function TrustPick({
  value,
  available,
  onChange,
}: {
  value: TrustLevel;
  /** What this agent's runtime can express. Weakest first, and never empty. */
  available: readonly TrustLevel[];
  onChange: (value: TrustLevel) => void;
}): React.JSX.Element {
  const levels = levelsFor(available);
  return (
    <Select.Root value={value} onValueChange={(next) => onChange(next as TrustLevel)}>
      <Select.Trigger className="field selecttrigger" aria-label="What it can do without asking">
        <Select.Value className="selectvalue" />
        <Select.Icon>
          <ChevronDown size={14} aria-hidden />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="selectmenu trustmenu" position="popper" sideOffset={6}>
          <Select.Viewport>
            {levels.map((level) => (
              <Select.Item key={level.id} value={level.id} className="selectitem trustitem">
                <Select.ItemText>{level.word}</Select.ItemText>
                <Select.ItemIndicator className="selecttick">
                  <Check size={13} aria-hidden />
                </Select.ItemIndicator>
                {/* Outside `ItemText`, so the trigger shows the word alone: the sentence is
                    what you read while choosing, and the trigger is what you read afterwards. */}
                <span className="trustsays">{level.says}</span>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
