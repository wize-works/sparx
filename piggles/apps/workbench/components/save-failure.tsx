'use client';

// The answer to "why didn't that save", put where the person is looking, and
// taken away when it stops being true.
//
// Ninety-eight surfaces had hand-rolled the same six lines — a conditional
// `<Alert color="error">` around a title and a message — and every one of them
// rendered at the TOP of a scrolling pane while the button that triggered it
// sits pinned in the toolbar. On a form taller than the pane, pressing Save
// produced a refusal 700px above the fold and no other change on screen. From
// the seat, that reads as a dead button (issue 404).

import { useEffect, useRef, useState } from 'react';
import { Alert, AlertContent, AlertDescription, AlertTitle } from '@wizeworks/silicaui-react';

export function SaveFailure({
  title,
  message,
  className,
}: {
  /** What failed, in the surface's own words: "Could not save this page". */
  title: string;
  /** The reason. Falsy renders nothing — this component IS the conditional. */
  message: string | null | undefined;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  // The last message revealed for. Re-revealing every render would fight the
  // person's own scrolling; revealing on a CHANGE still shows a second,
  // different failure.
  const revealed = useRef<string | null>(null);
  // Set when they start fixing it. A mutation's `isError` is sticky until the
  // next attempt, so without this the refusal sits there while they correct the
  // very field it named — the same "message outliving its cause" as issue 397,
  // moved from the toast into the pane.
  const [edited, setEdited] = useState(false);

  useEffect(() => {
    if (!message) {
      revealed.current = null;
      return;
    }
    if (revealed.current === message) return;
    revealed.current = message;
    setEdited(false);
    const node = ref.current;
    if (!node) return;
    node.scrollIntoView({ block: 'center', behavior: 'smooth' });
    node.focus({ preventScroll: true });
  }, [message]);

  // Scoped to the alert's own container, so one pane's edit never clears
  // another pane's message. A layout that puts the alert outside the fields
  // simply never fires this, which is no worse than before.
  useEffect(() => {
    if (!message || edited) return;
    const scope = ref.current?.parentElement;
    if (!scope) return;
    const onEdit = (event: Event) => {
      if (event.target instanceof Node && scope.contains(event.target)) setEdited(true);
    };
    scope.addEventListener('input', onEdit);
    scope.addEventListener('change', onEdit);
    return () => {
      scope.removeEventListener('input', onEdit);
      scope.removeEventListener('change', onEdit);
    };
  }, [message, edited]);

  if (!message || edited) return null;

  // The wrapper carries the ref and the focus target rather than the Alert
  // itself: Alert already sets `role="alert"`, and nesting a second one would
  // announce the same message twice.
  return (
    <div ref={ref} tabIndex={-1} className={`outline-none ${className ?? ''}`}>
      <Alert color="error">
        <AlertContent>
          <AlertTitle>{title}</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </AlertContent>
      </Alert>
    </div>
  );
}
