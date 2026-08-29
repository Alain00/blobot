import { Streamdown } from 'streamdown';

/**
 * Agents write markdown, so the transcript renders markdown: fenced code, tables, lists and
 * headings, rather than one pre-wrapped block of asterisks.
 *
 * Streamdown rather than a plain markdown renderer because a delta stream arrives with the
 * syntax half-typed — an unclosed fence, a table missing its last row — and it completes the
 * incomplete node instead of flashing the raw characters.
 *
 * It ships Tailwind class names and this app has no Tailwind; that is deliberate here. The
 * classes are inert, the elements it emits are plain HTML, and `.md` in `styles.css` dresses
 * them in the same monochrome vocabulary as the rest of the page. `controls={false}` drops its
 * copy/download chrome for the same reason: it is styled by a framework we do not run.
 */
export function Markdown({
  text,
  live = false,
}: {
  text: string;
  /** A message still streaming; `static` lets a settled one skip the incomplete-syntax repair. */
  live?: boolean;
}): React.JSX.Element {
  return (
    <div className="md">
      <Streamdown mode={live ? 'streaming' : 'static'} controls={false}>
        {text}
      </Streamdown>
    </div>
  );
}
