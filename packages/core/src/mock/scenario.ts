import type { StopReason, ToolKind } from '../events.js';

/**
 * Scenarios are the backbone: named, checked in, and what both the tests and demo mode play.
 * A raw event list is unreadable and unwritable at any length — spelling one sentence would
 * mean hand-authoring delta fragments. The builder keeps the *intent* legible
 * (`think(); callTool(); say()`) while the expansion owns the ugly realism.
 */

export interface ToolOutcome {
  /**
   * `completed` and `failed` are the honest outcomes. `cancelled_reports_completed` is the
   * observed lie: an aborted process reports `completed` with `exit: null`, and a mock that
   * hides it invites `if (status === 'completed') showSuccess()`.
   */
  readonly status: 'completed' | 'failed' | 'cancelled_reports_completed';
  readonly output?: string;
  readonly exit?: number | null;
  readonly error?: string;
}

export interface ToolStep {
  readonly title: string;
  readonly kind: ToolKind;
  readonly rawInput?: unknown;
  /** How long the tool runs. A cancel landing inside this window exercises the trap. */
  readonly durationMs: number;
  readonly outcome: ToolOutcome;
}

export type ScenarioStep =
  | { readonly kind: 'think'; readonly text: string; readonly overMs?: number }
  | { readonly kind: 'say'; readonly text: string; readonly overMs?: number }
  | { readonly kind: 'wait'; readonly ms: number }
  | { readonly kind: 'tool'; readonly tool: ToolStep }
  | {
      readonly kind: 'message_agent';
      readonly to: string;
      readonly message: string;
      readonly context?: string;
    }
  | {
      readonly kind: 'usage';
      readonly used: number;
      readonly size: number;
      readonly costUsd?: number;
    }
  | {
      readonly kind: 'error';
      readonly message: string;
      readonly code?: string;
      /** Whether the process is gone afterwards, or only this turn is lost. */
      readonly dies: boolean;
    }
  | { readonly kind: 'end'; readonly stopReason: StopReason };

export interface TextOptions {
  /** Stretch the whole utterance over this long, keeping the gaps ragged. */
  readonly overMs?: number;
}

export interface CallToolOptions {
  readonly rawInput?: unknown;
  readonly durationMs?: number;
  readonly outcome?: ToolOutcome;
}

/** Immutable: a scenario is a module-level constant, and a run must not mutate it. */
export class Scenario {
  readonly name: string;
  readonly steps: readonly ScenarioStep[];

  constructor(name: string, steps: readonly ScenarioStep[] = []) {
    this.name = name;
    this.steps = steps;
  }

  #with(step: ScenarioStep): Scenario {
    return new Scenario(this.name, [...this.steps, step]);
  }

  think(text: string, options: TextOptions = {}): Scenario {
    return this.#with(
      options.overMs === undefined
        ? { kind: 'think', text }
        : { kind: 'think', text, overMs: options.overMs },
    );
  }

  say(text: string, options: TextOptions = {}): Scenario {
    return this.#with(
      options.overMs === undefined
        ? { kind: 'say', text }
        : { kind: 'say', text, overMs: options.overMs },
    );
  }

  /** Silence. A slow agent is a real experience blobot must not look broken during. */
  wait(ms: number): Scenario {
    return this.#with({ kind: 'wait', ms });
  }

  callTool(title: string, kind: ToolKind, options: CallToolOptions = {}): Scenario {
    const tool: ToolStep = {
      title,
      kind,
      durationMs: options.durationMs ?? 400,
      outcome: options.outcome ?? { status: 'completed', exit: 0 },
      ...(options.rawInput === undefined ? {} : { rawInput: options.rawInput }),
    };
    return this.#with({ kind: 'tool', tool });
  }

  /**
   * A peer message. In the mock this calls the orchestrator's tool handler directly — the
   * mailbox, queueing and persistence are exactly the code most likely to be wrong, and the
   * transport is proven against real runtimes elsewhere.
   */
  messageAgent(to: string, message: string, context?: string): Scenario {
    return this.#with(
      context === undefined
        ? { kind: 'message_agent', to, message }
        : { kind: 'message_agent', to, message, context },
    );
  }

  usage(used: number, size = 200_000, costUsd?: number): Scenario {
    return this.#with(
      costUsd === undefined
        ? { kind: 'usage', used, size }
        : { kind: 'usage', used, size, costUsd },
    );
  }

  /**
   * A turn that errors halfway. The process is still up, but `error` is fatal by definition
   * — the agent is `failed` and needs a restart. The non-fatal way for a turn to go wrong is
   * a failed tool call, which the turn survives.
   */
  errorMidTurn(message: string, code?: string): Scenario {
    return this.#with(
      code === undefined
        ? { kind: 'error', message, dies: false }
        : { kind: 'error', message, code, dies: false },
    );
  }

  /** The process dies mid-turn. Sticky `failed`: it needs a restart. */
  die(message: string, code?: string): Scenario {
    return this.#with(
      code === undefined
        ? { kind: 'error', message, dies: true }
        : { kind: 'error', message, code, dies: true },
    );
  }

  /**
   * End the turn with an explicit stop reason — `refusal` and `max_tokens` are turns that
   * ended unusually, not failures. A scenario that omits this ends `end_turn`.
   */
  end(stopReason: StopReason = 'end_turn'): Scenario {
    return this.#with({ kind: 'end', stopReason });
  }
}

export function scenario(name: string): Scenario {
  return new Scenario(name);
}
