/**
 * The one place a `runtime_id` becomes words. It lives in the main process on purpose: the
 * renderer receives labels and sends ids back, and never learns what either means — which is
 * what "the UI is provider-agnostic" costs in practice.
 */
const LABELS: Record<string, string> = {
  'claude-code': 'Claude Code',
  opencode: 'OpenCode',
  codex: 'Codex',
  // Lowercase on purpose: it is how Vercel Labs writes it, and a label is a name.
  fx: 'fx',
  mock: 'Mock (demo)',
};

export function runtimeLabel(runtimeId: string): string {
  return LABELS[runtimeId] ?? runtimeId;
}
