import {
  BY_EXTENSION,
  BY_FILENAME,
  FILE_GLYPHS,
  FOLDER,
  FOLDER_OPEN,
  GENERIC,
  type FileGlyph,
} from './file-icons.generated.js';

/**
 * The mark at the head of a file-tree row: what kind of thing this is.
 *
 * `DESIGN.md`'s Icons rule is Lucide and nothing else, with one narrow exception for a runtime's
 * vendor mark. This is the second and last exception, and it is that rule reaching further
 * rather than a new one: **most of these marks are somebody's logo**, and `RuntimeMark`'s three
 * words govern them unchanged — *greyed, never coloured, never in place of the name.* Lucide
 * cannot do the job at all: `.ts`, `.tsx`, `.js`, `.mjs` and `.css` all collapse onto
 * `file-code`, so `Blob.tsx` and `styles.css` would draw identically.
 *
 * The extension stays in the name beside it, so a mark nobody recognises costs nothing.
 */
export function FileIcon({
  name,
  kind,
  open = false,
}: {
  name: string;
  kind: 'file' | 'directory';
  open?: boolean;
}): React.JSX.Element {
  const glyph = glyphFor(name, kind, open);
  return (
    <svg
      className="fileicon"
      viewBox={glyph.box}
      width={15}
      height={15}
      fill="currentColor"
      aria-hidden
      dangerouslySetInnerHTML={{ __html: glyph.body }}
    />
  );
}

/**
 * Which glyph a name draws.
 *
 * A whole filename wins over an extension (`package.json` is not a JSON file to anybody), and a
 * longer extension wins over a shorter one, so `index.d.ts` is a declaration rather than
 * TypeScript. **A miss is the generic page**, which is this set's resting state rather than a
 * failure: a quarter of all files draw it with Material's whole 1,251 glyphs bundled, and this
 * app bundles 81.
 */
export function glyphFor(name: string, kind: 'file' | 'directory', open: boolean): FileGlyph {
  if (kind === 'directory') {
    return (FILE_GLYPHS[open ? FOLDER_OPEN : FOLDER] ?? FILE_GLYPHS[GENERIC]) as FileGlyph;
  }
  return (FILE_GLYPHS[iconNameFor(name)] ?? FILE_GLYPHS[GENERIC]) as FileGlyph;
}

/** Exported for the table test, which is the only thing that should ever assert a glyph name. */
export function iconNameFor(name: string): string {
  const lower = name.toLowerCase();
  const byName = BY_FILENAME[lower];
  if (byName !== undefined) return byName;
  // Every suffix after a dot, longest first: `test.tsx` before `tsx`, `d.ts` before `ts`.
  const parts = lower.split('.');
  for (let index = 1; index < parts.length; index += 1) {
    const found = BY_EXTENSION[parts.slice(index).join('.')];
    if (found !== undefined) return found;
  }
  return GENERIC;
}
