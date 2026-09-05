import { useRef, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { workingCeiling } from '@blobot/core/domain';
import type { UiAgent, UiUsage } from '../../../shared/api.js';
import { percent, tokens } from '../usage.js';
import { Blob } from './Blob.js';

/**
 * How full the window is that this message is about to go into. **In the composer, as a ring.**
 *
 * The same reading as the activity column's `CONTEXT` block and deliberately not a second
 * source of it — `usage.ts` is shared so the two can never round differently. What differs is
 * the question each answers. The column asks *how full is every window on this team*, which is
 * a list. The composer asks *how full is the one I am writing into*, which is one figure, and
 * it belongs beside the field because that is where the writing happens: a person about to
 * paste a stack trace into an agent at 94% should not have to look at another column to find
 * that out.
 *
 * **Observation only, the gauge's standing rule.** It advises nothing, it refuses nothing, and
 * it is never a reason a send is disabled. blobot chooses the moment for a handoff on its own
 * (`.scratch/transcript-scale/10`) and this ring is not that mechanism, nor a warning that it
 * is coming.
 *
 * **It draws only for the recipients, and only when they have reported.** An agent that has
 * never taken a turn has no reading, and a ring at 0% would be a claim about an empty window
 * rather than about an unknown one — so there is nothing there at all, which is the same thing
 * the `CONTEXT` block does with the same case. On a fan-out the ring is the **fullest**
 * recipient, because that is the one that constrains what can be sent to all of them, and the
 * panel names it and lists every other one: a single ring over several agents is only honest
 * if the number belongs to a named agent and the rest are one hover away.
 *
 * **It opens on hover, and it is numbers only.** A press is too much ceremony for a figure a
 * person wants in passing, and it shipped explaining itself in three lines under the rows —
 * where the handoff comes from, that nothing here is a limit — which was the largest thing in
 * the panel, read once and noise every time after. The rows say what they say.
 */
export function ContextRing({
  recipients,
  usage,
}: {
  /** Everybody this send is addressed to, in the order the composer resolved them. */
  recipients: readonly UiAgent[];
  usage: Record<string, UiUsage>;
}): React.JSX.Element | null {
  const [open, setOpen] = useState(false);
  // A small close delay, so the pointer can cross the gap between the ring and the panel
  // without the panel going away underneath it. Opening is immediate: this is a number the
  // pointer is already on, not a menu with a cost to being wrong about.
  const closing = useRef<number | undefined>(undefined);
  const show = (): void => {
    window.clearTimeout(closing.current);
    setOpen(true);
  };
  const hide = (): void => {
    window.clearTimeout(closing.current);
    closing.current = window.setTimeout(() => setOpen(false), 120);
  };

  const rows = recipients
    .map((agent) => ({ agent, reading: usage[agent.id] }))
    .filter((row): row is { agent: UiAgent; reading: UiUsage } => row.reading !== undefined)
    .map((row) => ({
      ...row,
      ceiling: workingCeiling(row.agent.contextCeiling, row.reading.size),
    }))
    .map((row) => ({ ...row, pct: percent(row.reading.used, row.ceiling.tokens) }))
    // Fullest first, so the ring and the head of the list are the same agent.
    .sort((a, b) => b.pct - a.pct);
  const worst = rows[0];
  if (worst === undefined) return null;
  const past = worst.reading.used >= worst.ceiling.tokens;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        className="ctxring"
        onPointerEnter={show}
        onPointerLeave={hide}
        onFocus={show}
        onBlur={hide}
        /* No `title`. The panel already opens on hover, and a native tooltip crawling out from
           under it a second later would be the same fact said twice, late. */
        aria-label={`Context: ${worst.agent.name} at ${worst.pct} percent`}
      >
        <Ring pct={past ? 100 : worst.pct} />
      </Popover.Trigger>
      <Popover.Portal>
        {/* Above its trigger, like everything else that hangs off the composer: the pill sits at
            the foot of the window and there is nothing below it to open into. */}
        <Popover.Content
          className="ctxpop"
          side="top"
          align="end"
          sideOffset={10}
          collisionPadding={12}
          onPointerEnter={show}
          onPointerLeave={hide}
          /* It opens on hover, so it must not take focus: a panel that stole the caret out of
             the composer because the pointer passed over a gauge would be the field losing the
             user's place for a fact they did not ask for. */
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <div className="mono muted ctxpophead">CONTEXT</div>
          {rows.map(({ agent, reading, ceiling, pct }) => (
            <div key={agent.id} className="ctxpoprow">
              <Blob name={agent.name} size={14} hue={agent.hue} shape={agent.shape} />
              <span className="who">{agent.name}</span>
              <span className="n mono muted">
                {tokens(reading.used)}/{tokens(reading.size)}
              </span>
              {/* The denominator is named beside the percent, here as in the column: a percent
                  of the advertised window and a percent of the working ceiling are different
                  numbers, and only one of them is what a reader would act on. */}
              {reading.used >= ceiling.tokens ? (
                <span className="p mono past">past {tokens(ceiling.tokens)}</span>
              ) : (
                <span className="p mono">
                  {pct}% <span className="muted">of {tokens(ceiling.tokens)}</span>
                </span>
              )}
            </div>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * The dial. One track, one arc, drawn with `stroke-dasharray` rather than as a conic gradient,
 * because the arc has to have a round cap and a gradient cannot be given one.
 *
 * Monochrome, like every other status in this app: fullness is carried by how much of the ring
 * is `--ink` and the rest is `--line`. Nothing about a full window is an alarm, so nothing here
 * turns red — that would be the one saturated thing on screen competing with the blobatars, and
 * for a fact the app handles by itself.
 */
function Ring({ pct }: { pct: number }): React.JSX.Element {
  const r = 7;
  const circumference = 2 * Math.PI * r;
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <circle className="track" cx="9" cy="9" r={r} fill="none" strokeWidth="2" />
      <circle
        className="arc"
        cx="9"
        cy="9"
        r={r}
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={`${(circumference * pct) / 100} ${circumference}`}
        // Twelve o'clock, which is where a dial starts.
        transform="rotate(-90 9 9)"
      />
    </svg>
  );
}
