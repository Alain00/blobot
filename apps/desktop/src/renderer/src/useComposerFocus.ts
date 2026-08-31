import { useEffect, useState } from 'react';

/**
 * The composer, while the user is actually in it. Otherwise `null`.
 *
 * This exists so a face can look at where the words are being written, and the *while* is the
 * whole of what makes that admissible. A face that turned toward the composer because an agent
 * is pending would be ambient motion — it would start on its own, on a budget DESIGN.md says is
 * already spent on status. Gated on focus it is interaction motion instead: it happens because
 * a person put their cursor in a field, and it is over when they leave. Nothing is learned from
 * it either way, which is the other half of the rule.
 *
 * It is also the only honest reading of the gesture. blobot cannot know that an agent has
 * noticed anything — no runtime reports attention, and inventing one would be the interface
 * asserting a state the status fold never derived. What the turn actually acknowledges is the
 * *user's* own action, which is a thing the interface is allowed to know.
 *
 * The node is found in the document rather than passed down, which is `useComposerRoom`'s
 * pattern and its reason: the transcript and the composer are siblings under the pane, and
 * neither should have to learn about the other to be laid out. There is exactly one composer on
 * screen, so the query cannot be ambiguous.
 *
 * Both events read `document.activeElement` immediately, with no deferral, and that is a
 * finding rather than a shortcut. `focusout` fires while `activeElement` is still `body`, so
 * tabbing from the field to the send button really does produce a null between two identical
 * answers — and React batches the pair into one render, so the state never holds the null and
 * no effect ever sees it. A deferred read was written first and removed: it cost a frame and a
 * cancellation to prevent a flicker that automatic batching already prevents, and a guard that
 * defends nothing is worse than none, because the next reader believes it.
 */
export function useComposerFocus(): Element | null {
  const [composer, setComposer] = useState<Element | null>(null);

  useEffect(() => {
    const read = (): void => {
      const active = document.activeElement;
      setComposer(active === null ? null : active.closest('.composer'));
    };

    read();
    document.addEventListener('focusin', read);
    document.addEventListener('focusout', read);
    return () => {
      document.removeEventListener('focusin', read);
      document.removeEventListener('focusout', read);
    };
  }, []);

  return composer;
}
