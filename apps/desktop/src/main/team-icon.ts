import { nativeImage } from 'electron';
import { findWorkspaceIcon } from '@blobot/core';

/** An icon offered to the user, with where it came from, because a suggestion has to say. */
export interface TeamIconSuggestion {
  /** A `data:image/png;base64,…` URL, ready for an `<img>` and for the teams table. */
  readonly dataUrl: string;
  /** Relative to the Workspace for a detected icon; the file's own name for a chosen one. */
  readonly from: string;
}

/**
 * Turn an image file into the one form a team icon is ever stored or drawn in: a small PNG,
 * inline.
 *
 * Downscaled here rather than in CSS, and that is the substantive part. The column holds this
 * string, the rail draws it at 34 pixels, and a 900KB logo would be carried through the
 * database, the IPC snapshot and every render to be painted into a box the size of a fingernail.
 * 128 is twice the largest size anything draws it at, which leaves the retina headroom and
 * nothing else.
 *
 * `nativeImage` decodes PNG, JPEG and WebP and nothing else, which is the raster-only rule from
 * `findWorkspaceIcon` enforced rather than restated: an SVG out of a repository blobot did not
 * write comes back empty here and is reported as unreadable, so it never reaches the renderer.
 */
export function encodeTeamIcon(path: string): string | undefined {
  const image = nativeImage.createFromPath(path);
  if (image.isEmpty()) return undefined;
  const { width, height } = image.getSize();
  const scaled = Math.max(width, height) > MAX_EDGE
    // One dimension only: `resize` keeps the aspect ratio from the other, and squashing a
    // wordmark into a square is the one thing that would make a recognisable logo unreadable.
    ? image.resize(width >= height ? { width: MAX_EDGE } : { height: MAX_EDGE })
    : image;
  return `data:image/png;base64,${scaled.toPNG().toString('base64')}`;
}

const MAX_EDGE = 128;

/**
 * What the creation flow offers when a folder is picked: whatever image the project already
 * uses to stand for itself, or nothing.
 *
 * Nothing is a perfectly good answer and is not an error. A folder blobot just made for a new
 * team has no icon in it by definition, and a team with no icon is drawn from its members,
 * which is what every team looked like before this existed.
 */
export async function suggestTeamIcon(workspacePath: string): Promise<TeamIconSuggestion | undefined> {
  const found = await findWorkspaceIcon(workspacePath);
  if (found === undefined) return undefined;
  const dataUrl = encodeTeamIcon(found.path);
  return dataUrl === undefined ? undefined : { dataUrl, from: found.relative };
}
