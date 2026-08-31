/**
 * The browser APIs jsdom is missing that an animated blobatar cannot start without.
 *
 * The gaze driver asks two questions before it does anything — whether the pointer is a real
 * one, and whether the user asked for reduced motion, both `matchMedia` — and then watches its
 * own element for resizes. jsdom implements neither, so a component test that renders
 * `animated` blobatars throws on mount rather than failing an assertion, and it throws inside a
 * passive effect, which is a stack with none of the test's own frames in it.
 *
 * It answers **no** to everything, which stands the gaze down. That is deliberate rather than
 * lazy: nothing about a face's eyes is worth asserting in jsdom, where there is no layout, no
 * `getBBox` and no pointer, and a driver that believed otherwise would be a live rAF loop under
 * every test that draws a rail. The reason these tests exist is what is written *around* the
 * face — the word, the dots, the pose class — and this is what lets them get to it.
 *
 * Shared rather than repeated per file because the reason is a property of the app now: any
 * test that renders a surface with an animated blobatar on it needs this, and three copies of
 * the same paragraph would drift the first time one of them was edited.
 */
export function stubGazeHost(): void {
  globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver;

  globalThis.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: (): void => {},
    removeEventListener: (): void => {},
    addListener: (): void => {},
    removeListener: (): void => {},
    dispatchEvent: (): boolean => false,
  })) as unknown as typeof matchMedia;
}
