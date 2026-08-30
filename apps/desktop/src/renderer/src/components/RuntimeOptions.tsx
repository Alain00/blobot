import { Fragment, useEffect, useState } from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { Command } from 'cmdk';
import { Check, ChevronDown } from 'lucide-react';
import type { UiRuntimeOptionGroup, UiRuntimeOptions } from '../../../shared/api.js';

/**
 * A menu stops being scannable somewhere around a dozen rows, and a model list is routinely
 * three times that: one runtime here advertises every checkpoint it has ever shipped. Past this
 * count the menu grows a field.
 *
 * A threshold rather than always: a field the user pays for on every hire and needs on one
 * runtime is the search bar DESIGN.md refuses in the chrome, moved into a menu.
 */
const FILTER_AT = 12;

/**
 * Focus lands inside the list rather than on the menu itself: on the field where there is one,
 * on the list where there is not. Radix focuses the content element, and cmdk listens for the
 * arrow keys on its own root *below* that, so a key pressed on the content reaches nothing.
 *
 * Declared out here because `onOpenAutoFocus` is `Menu.Content`'s own prop and the dropdown
 * spreads its props straight through to it, but leaves it out of the types it re-exports.
 * Moving the focus later, from an effect, is the version that does not work: the dialog around
 * this control has a focus scope, and focus arriving after both layers have settled reads to it
 * as focus escaping, which shuts the menu.
 */
const intoTheList = {
  onOpenAutoFocus: (event: Event) => {
    event.preventDefault();
    const content = event.currentTarget as HTMLElement | null;
    const field = content?.querySelector('[cmdk-input]') as HTMLElement | null;
    const list = content?.querySelector('[cmdk-list]') as HTMLElement | null;
    (field ?? list)?.focus();
  },
} as React.ComponentProps<typeof Menu.Content>;

/**
 * What an agent is set to on its runtime: a model, a reasoning effort, whatever else that
 * runtime happens to offer.
 *
 * **This component knows none of those words.** It is handed groups with ids, labels and
 * choices, and it draws them in the order it received them. `effort` is a Claude word and
 * `openai/gpt-5.4` is an OpenCode string; a component that recognised either would know which
 * provider it was rendering, which is the one thing the UI may never know. It is also why the
 * control can draw three groups for one runtime and one for another without a branch: the
 * asymmetry is data. The filter is the same rule under load — it matches text, so it works on a
 * list of model names nobody here has read.
 *
 * One trigger and one menu rather than a select per group, because these are one decision
 * about one agent and three stacked pickers would read as three unrelated settings. The
 * trigger says what the agent will do, which is what the user came to check.
 *
 * Choosing the runtime's own default **stores nothing**. That is not a shortcut: an agent
 * pinned to today's default keeps it after the provider moves on, and the user who picked
 * "whatever this runtime does" would have silently been given "whatever it did in August".
 *
 * **Radix holds the popover, cmdk holds the list**, which is DESIGN.md's own division: a menu
 * you type into is a combobox, and every Radix menu moves real focus onto the row under the
 * pointer, which takes the field away mid-word. cmdk moves a virtual cursor and leaves focus in
 * the input. The trade is that these rows are `option`s rather than `menuitemradio`s, and the
 * group is a heading rather than a radio group.
 *
 * The field is **not** the navigator by another name, and does not weaken the one-search rule:
 * it narrows a list the user has already opened, it holds nothing between openings, and it can
 * only reach the choices in front of it.
 */
export function RuntimeOptions({
  runtimeId,
  value,
  onChange,
}: {
  runtimeId: string;
  value: Readonly<Record<string, string>>;
  onChange: (options: Readonly<Record<string, string>>) => void;
}): React.JSX.Element {
  const [state, setState] = useState<UiRuntimeOptions | undefined>();
  const [asking, setAsking] = useState(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (runtimeId === '') return;
    let current = true;
    setState(undefined);
    setAsking(true);
    void window.blobot.describeRuntimeOptions(runtimeId).then((options) => {
      if (!current) return;
      setState(options);
      setAsking(false);
    });
    return () => {
      // The runtime picker can change while a probe is in flight, and a slow answer for the
      // runtime the user has moved off must not repaint the menu under them.
      current = false;
    };
  }, [runtimeId]);


  const groups = state?.groups ?? [];

  if (runtimeId === '') {
    // No runtime picked yet, which is a beat the user actually sees while detection is out.
    // It must not say the runtime offers nothing: nobody has been asked anything yet.
    return <span className="note mono muted">pick a runtime first</span>;
  }
  if (asking) {
    return <span className="note mono muted">asking what it offers…</span>;
  }
  if (state?.error !== undefined) {
    // Never a refusal: hiring is not gated on a runtime answering, exactly as it is not gated
    // on detection. The agent takes the runtime's own defaults, which is where it would be.
    return <span className="note mono muted">its options could not be read · {state.error}</span>;
  }
  if (groups.length === 0) {
    return <span className="note mono muted">nothing to choose on this runtime</span>;
  }

  const choose = (groupId: string, choice: { value: string; isDefault?: boolean }): void => {
    const next = { ...value };
    if (choice.isDefault === true) delete next[groupId];
    else next[groupId] = choice.value;
    onChange(next);
    setOpen(false);
  };

  const total = groups.reduce((count, group) => count + group.choices.length, 0);
  const filterable = total >= FILTER_AT;
  const shown = narrow(groups, filterable ? query : '');
  const showing = shown.reduce((count, group) => count + group.choices.length, 0);
  const opensOn = rowId(groups[0], value);

  return (
    <Menu.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // The query dies with the menu. It narrows what is on screen and nothing else, so
        // reopening to a list still cut down by a word typed ten minutes ago would be the menu
        // hiding models the user never asked it to hide.
        if (!next) setQuery('');
      }}
    >
      <Menu.Trigger className="field selecttrigger" aria-label="Model and effort">
        <span>{summaryOf(groups, value)}</span>
        <ChevronDown size={14} aria-hidden />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content className="selectmenu optionsmenu" sideOffset={6} align="start" {...intoTheList}>
          <Command
            label="Model and effort"
            loop
            shouldFilter={false}
            className="optionscommand"
            // Open on what the agent is set to rather than on row one. On a list this long the
            // first thing a person wants is the row they are already on, and cmdk scrolls its
            // highlighted row into view. Uncontrolled from there: once a query narrows the
            // list, moving the highlight onto the first match is cmdk's job and not ours.
            {...(opensOn === undefined ? {} : { defaultValue: opensOn })}
          >
            {filterable && (
              <div className="optionsfilter">
                <Command.Input
                  value={query}
                  onValueChange={setQuery}
                  placeholder="Filter"
                />
                <span className="optionscount mono">
                  {query === '' ? `${total}` : `${showing} of ${total}`}
                </span>
              </div>
            )}
            <Command.List tabIndex={-1}>
              <Command.Empty>Nothing matches</Command.Empty>
              {shown.map((group, index) => (
                <Fragment key={group.id}>
                  {index > 0 && <div className="optionsrule" aria-hidden />}
                  <Command.Group
                    heading={<span className="optionslabel mono">{group.label.toUpperCase()}</span>}
                  >
                    {group.choices.map((choice) => {
                      const chosen = (value[group.id] ?? defaultOf(group)) === choice.value;
                      return (
                        <Command.Item
                          // Two runtimes could name a choice the same in two groups, and cmdk
                          // keys the highlight off this value.
                          key={choice.value}
                          value={`${group.id} ${choice.value}`}
                          className="selectitem"
                          onSelect={() => choose(group.id, choice)}
                        >
                          <span className="optionsname">{choice.label}</span>
                          {choice.isDefault === true && (
                            <span className="optionsbadge mono">default</span>
                          )}
                          {chosen && (
                            <span className="selecttick">
                              <Check size={13} aria-hidden />
                            </span>
                          )}
                        </Command.Item>
                      );
                    })}
                  </Command.Group>
                </Fragment>
              ))}
            </Command.List>
          </Command>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

/** The cmdk value of a group's effective choice, in the one format the rows are keyed by. */
function rowId(
  group: UiRuntimeOptionGroup | undefined,
  value: Readonly<Record<string, string>>,
): string | undefined {
  if (group === undefined) return undefined;
  const chosen = value[group.id] ?? defaultOf(group);
  return chosen === undefined ? undefined : `${group.id} ${chosen}`;
}

/**
 * The typed words against the choices, and the groups left with nothing dropped.
 *
 * Matched on the **label and the value together**, because they are routinely different words
 * for the same thing: OpenCode labels `openai/gpt-5.4` as `GPT-5.4`, and a user who types the
 * string they read in a changelog should find the row they read it about. Every token has to
 * match somewhere, so `gpt 5` narrows rather than widening the way a naive OR would.
 *
 * Substring rather than fuzzy: model names are dense with digits and punctuation, and a fuzzy
 * score on `4.5` happily returns everything with a 4 and a 5 in it.
 */
export function narrow(
  groups: readonly UiRuntimeOptionGroup[],
  query: string,
): UiRuntimeOptionGroup[] {
  const tokens = query.toLowerCase().split(/\s+/).filter((token) => token !== '');
  if (tokens.length === 0) return [...groups];
  return groups.flatMap((group) => {
    const choices = group.choices.filter((choice) => {
      const haystack = `${choice.label} ${choice.value}`.toLowerCase();
      return tokens.every((token) => haystack.includes(token));
    });
    return choices.length === 0 ? [] : [{ ...group, choices }];
  });
}

/**
 * The line on the trigger: what this agent will actually do, one word per group.
 *
 * It reads the *effective* value rather than the stored one, so an agent with nothing stored
 * still says `Opus 1M · Medium` instead of an empty control the user has to open to understand.
 */
export function summaryOf(
  groups: readonly UiRuntimeOptionGroup[],
  value: Readonly<Record<string, string>>,
): string {
  const parts = groups.flatMap((group) => {
    const chosen = value[group.id] ?? defaultOf(group);
    const label = group.choices.find((choice) => choice.value === chosen)?.label;
    return label === undefined ? [] : [label];
  });
  return parts.length === 0 ? 'its own defaults' : parts.join(' · ');
}

function defaultOf(group: UiRuntimeOptionGroup): string | undefined {
  return group.choices.find((choice) => choice.isDefault === true)?.value;
}
