import * as Select from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import React from 'react';
import type { VerbosityLevel } from '../../../shared/api.js';

/**
 * How much this agent says when it answers.
 *
 * The third of the same family, and built as `TrustPick`'s twin for the reason `CompactionPick`
 * is: three words of blobot's own, the same select, the same sentence under the closed control.
 * A reader who has learned to read one of these should not have to learn a third shape.
 *
 * Per agent, like the other two, and for a plainer reason than either: a reviewer and a
 * implementer on one team are not owed the same amount of prose, and nothing about wanting one
 * of them terse says anything about the other.
 *
 * **`normal` is the default and is not marked as recommended**, exactly as `normal` trust is
 * not. It is the one already selected, which says it better than a badge would, and a badge
 * would imply the other two are mistakes. They are not: `full` is the right answer for an agent
 * whose reasoning is the thing you are reading it for.
 */

interface Choice {
  readonly id: VerbosityLevel;
  readonly word: string;
  readonly says: string;
}

/**
 * The copy. Written for somebody who has never thought about a system prompt, which rules out
 * every word blobot uses internally for this: no *verbosity*, no *persona*, no *tokens*.
 *
 * Each sentence says what the agent does with its words and never what it does with the work,
 * because that is the line the persona lines are held to as well. `brief` in particular must not
 * read as *tells you less*: an agent that had to refuse something says so at every level, and
 * the sentence is written so nobody reads a gag into it.
 */
const CHOICES: readonly Choice[] = [
  {
    id: 'brief',
    word: 'brief',
    says: 'A line or two. No preamble and no summary at the end. It still says what it could not do.',
  },
  {
    id: 'normal',
    word: 'normal',
    says: 'A short answer, and a longer one when the work needs the room.',
  },
  {
    id: 'full',
    word: 'full',
    says: 'It explains its reasoning and shows its working, including what it decided against.',
  },
];

/**
 * The sentence is on the menu row and not under the closed control. *2026-08-31.* Three of these
 * stand in a row in the agent form and each carried its explanation permanently on screen, which
 * is three paragraphs of blobot explaining itself around two words the user came to set. The
 * text is unchanged and one keystroke away, on the row it belongs to, where it is read while the
 * choice is being made rather than after it has been.
 */
/**
 * `chip` is the label this control wears in the agent bar, where it is a chip in a row of them
 * rather than a field in a column. The menu is untouched: the word and the sentence under it are
 * the same, read in the same place. Only the closed shape differs, because the bar states an
 * answer where the column asked a question.
 */
export function VerbosityPick({
  value,
  onChange,
  chip,
}: {
  value: VerbosityLevel;
  onChange: (value: VerbosityLevel) => void;
  chip?: string;
}): React.JSX.Element {
  return (
    <Select.Root value={value} onValueChange={(next) => onChange(next as VerbosityLevel)}>
      <Select.Trigger
        className={chip === undefined ? 'field selecttrigger' : 'chip'}
        aria-label="How much it says"
      >
        {chip !== undefined && <span className="mono">{chip}</span>}
        <Select.Value className="selectvalue" />
        {chip === undefined && (
          <Select.Icon>
            <ChevronDown size={14} aria-hidden />
          </Select.Icon>
        )}
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="selectmenu trustmenu" position="popper" sideOffset={6}>
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
