import * as Select from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import React from 'react';
import type { CompactionSetting } from '../../../shared/api.js';

/**
 * Whether blobot may start this agent a fresh session when its window fills up.
 *
 * `TrustPick`'s twin, and built as one deliberately: two positions instead of three, the same
 * select, the same sentence under the closed control. They are the two controls in this form
 * whose words are blobot's own rather than a provider's, and a reader who has learned to read
 * one should not have to learn a second shape for the other.
 *
 * Per agent, like everything else in this dialog, because a session and a window and a worktree
 * are per agent and two agents on one team fill up at wildly different rates.
 *
 * **On is the default and is not marked as recommended**, exactly as `normal` is not: it is the
 * one already selected, which says it better than a badge, and a badge would imply the other is
 * a mistake. It is on by default because a setting somebody has to go and find helps only the
 * people who were already going to type `/compact`.
 */

interface Choice {
  readonly id: CompactionSetting;
  readonly word: string;
  readonly says: string;
}

/**
 * The copy. Written for somebody who has never thought about a context window, which rules out
 * the word *context* in the first sentence and rules out *compaction* entirely.
 *
 * The `auto` sentence has to carry the one fact that makes this safe to leave on, which is that
 * the work survives: an agent's real state is its branch and its working tree, not its
 * conversation. The `off` sentence says what happens instead rather than only what does not,
 * because the honest cost of turning this off is an agent that gets worse without saying so.
 */
const CHOICES: readonly Choice[] = [
  {
    id: 'auto',
    word: 'on',
    says:
      'When it runs out of room, it writes itself a handoff and starts again. Its branch, its ' +
      'commits and its working tree are untouched.',
  },
  {
    id: 'off',
    word: 'off',
    says: 'It keeps going until it runs out of room. You can compact it yourself from the composer.',
  },
];

/**
 * The sentence is on the menu row and not under the closed control. *2026-08-31.* Three of these
 * stand in a row in the agent form and each carried its explanation permanently on screen, which
 * is three paragraphs of blobot explaining itself around two words the user came to set. The
 * text is unchanged and one keystroke away, on the row it belongs to, where it is read while the
 * choice is being made rather than after it has been.
 */
export function CompactionPick({
  value,
  onChange,
}: {
  value: CompactionSetting;
  onChange: (value: CompactionSetting) => void;
}): React.JSX.Element {
  return (
    <Select.Root value={value} onValueChange={(next) => onChange(next as CompactionSetting)}>
      <Select.Trigger
        className="field selecttrigger"
        aria-label="Starting over when it runs out of room"
      >
        <Select.Value className="selectvalue" />
        <Select.Icon>
          <ChevronDown size={14} aria-hidden />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="selectmenu" position="popper" sideOffset={6}>
          <Select.Viewport>
            {CHOICES.map((choice) => (
              <Select.Item key={choice.id} value={choice.id} className="selectitem trustitem">
                <Select.ItemText>{choice.word}</Select.ItemText>
                <Select.ItemIndicator className="selecttick">
                  <Check size={13} aria-hidden />
                </Select.ItemIndicator>
                <span className="trustsays">{choice.says}</span>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
