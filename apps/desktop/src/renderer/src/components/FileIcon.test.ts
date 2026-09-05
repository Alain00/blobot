import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { iconNameFor } from './FileIcon.js';

/**
 * The lookup, as a table. **No component test asserts a glyph** — that keeps the subset free to
 * grow from what people open without touching the tree's own tests.
 */
describe('which glyph a filename draws', () => {
  it('tells the extensions Lucide collapsed onto one page', () => {
    // The measurement that sent this to a second icon set: seven usable Lucide glyphs, and
    // `.ts`, `.tsx`, `.js`, `.mjs` and `.css` all landed on `file-code`, so `Blob.tsx` and
    // `styles.css` drew identically. `.mjs` and `.js` still share one, which is right: they are
    // the same language, and that was never the complaint.
    const drawn = ['Blob.tsx', 'model.ts', 'main.js', 'styles.css'].map(iconNameFor);
    expect(new Set(drawn).size).toBe(drawn.length);
    expect(iconNameFor('run.mjs')).toBe(iconNameFor('main.js'));
  });

  it('prefers a whole filename to its extension', () => {
    expect(iconNameFor('package.json')).not.toBe(iconNameFor('data.json'));
  });

  it('prefers the longer extension', () => {
    expect(iconNameFor('index.d.ts')).not.toBe(iconNameFor('index.ts'));
  });

  it('falls to the generic page rather than failing', () => {
    expect(iconNameFor('notes.qqqq')).toBe('file');
    expect(iconNameFor('LICENCE-WITH-NO-DOT')).toBe('file');
  });
});

describe('the generated module', () => {
  it('holds no colour, because greyed is the whole of the exception', () => {
    const source = readFileSync(
      join(import.meta.dirname, 'file-icons.generated.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/fill="#/);
    expect(source).not.toMatch(/url\(#/);
  });
});
