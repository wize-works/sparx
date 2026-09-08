'use client';

// The three gestures the workspace itself answers to, and they are exclusive:
// moving a window, resizing one, and dragging the ground to pan. Plain DOM, no
// React — every one of them is measured in pixels and settled before paint.

/** Within this of an edge, moving a window scrolls the workspace along with it. */
const EDGE = 56;
const EDGE_STEP = 28;
/** Wheel travel a ctrl-wheel or a pinch has to cover before it counts as a step.
 *  A trackpad emits dozens of events per gesture; without this, one pinch runs
 *  the whole ladder. */
const WHEEL_STEP = 60;

/**
 * Which of dockview's two window gestures this is, if either.
 *
 * A window is MOVED by the empty stretch of its title bar (or its body with
 * shift held) and RESIZED by the eight edge handles. The difference matters:
 * only a move is worth lining up with its neighbours afterwards.
 */
function windowDragKind(target: Element, shiftKey: boolean): 'move' | 'resize' | null {
  if (!target.closest('.dv-resize-container')) return null;
  if (target.closest('.dv-void-container')) return 'move';
  // One class per direction — `dv-resize-handle-top`, `-bottomright`, …
  if ([...target.classList].some((name) => name.startsWith('dv-resize-handle-'))) return 'resize';
  return shiftKey ? 'move' : null;
}

export interface CanvasGestureOptions {
  frame: HTMLElement;
  /** Whether an element is bare ground rather than something dockview owns. */
  isGround: (target: EventTarget | null) => boolean;
  /** A window is being dragged — the extent has to keep up with it. */
  onWindowDrag: () => void;
  /** A window drag finished. Carries its element after a MOVE, null after a
   *  resize, where there is nothing to line up. */
  onDragEnd: (moved: HTMLElement | null) => void;
  /** Ctrl-wheel, or a trackpad pinch, which the browser reports as the same. */
  onZoomStep: (direction: 1 | -1) => void;
}

export function installCanvasGestures({
  frame,
  isGround,
  onWindowDrag,
  onDragEnd,
  onZoomStep,
}: CanvasGestureOptions): () => void {
  let dragging: 'move' | 'resize' | null = null;
  let grabbed: HTMLElement | null = null;
  let panFrom: { x: number; y: number } | null = null;
  let wheeled = 0;

  const onPointerDown = (event: PointerEvent) => {
    if (!(event.target instanceof Element)) return;

    // Middle button anywhere, or the primary button on bare canvas.
    if (event.button === 1 || (event.button === 0 && isGround(event.target))) {
      panFrom = { x: event.clientX, y: event.clientY };
      frame.setPointerCapture(event.pointerId);
      frame.classList.add('is-panning');
      event.preventDefault();
      return;
    }

    if (event.button !== 0) return;
    dragging = windowDragKind(event.target, event.shiftKey);
    grabbed = dragging ? event.target.closest('.dv-resize-container') : null;
  };

  const onPointerMove = (event: PointerEvent) => {
    if (panFrom) {
      // The workspace slides UNDER the hand, so the ground stays with the
      // fingers rather than running the other way.
      frame.scrollLeft -= event.clientX - panFrom.x;
      frame.scrollTop -= event.clientY - panFrom.y;
      panFrom = { x: event.clientX, y: event.clientY };
      return;
    }
    if (!dragging) return;

    // dockview works out where the pointer is from the canvas's own rectangle,
    // and this listener runs first, so scrolling here slides the workspace while
    // leaving the window under the cursor. Driven by pointer movement rather
    // than a timer: a scroll continuing under a stationary cursor would leave
    // the window behind.
    const box = frame.getBoundingClientRect();
    if (event.clientX > box.right - EDGE) frame.scrollLeft += EDGE_STEP;
    else if (event.clientX < box.left + EDGE) frame.scrollLeft -= EDGE_STEP;
    if (event.clientY > box.bottom - EDGE) frame.scrollTop += EDGE_STEP;
    else if (event.clientY < box.top + EDGE) frame.scrollTop -= EDGE_STEP;
    onWindowDrag();
  };

  const onPointerUp = (event: PointerEvent) => {
    if (panFrom) {
      panFrom = null;
      frame.classList.remove('is-panning');
      if (frame.hasPointerCapture(event.pointerId)) frame.releasePointerCapture(event.pointerId);
      return;
    }
    if (!dragging) return;
    const moved = dragging === 'move' ? grabbed : null;
    dragging = null;
    grabbed = null;
    onDragEnd(moved);
  };

  const onWheel = (event: WheelEvent) => {
    // Ctrl-wheel is what a trackpad pinch arrives as, so both land here. A plain
    // wheel is left alone, since over the ground it should scroll.
    if (!event.ctrlKey) return;
    event.preventDefault();
    wheeled += event.deltaY;
    if (Math.abs(wheeled) < WHEEL_STEP) return;
    onZoomStep(wheeled < 0 ? 1 : -1);
    wheeled = 0;
  };

  // Capture on `window`, so the move runs before dockview's own drag listeners,
  // which it registers on `window` in the bubble phase. Not passive on the
  // wheel: a zoom gesture has to be able to stop the browser zooming with it.
  frame.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('pointermove', onPointerMove, true);
  window.addEventListener('pointerup', onPointerUp, true);
  window.addEventListener('pointercancel', onPointerUp, true);
  frame.addEventListener('wheel', onWheel, { passive: false });

  return () => {
    frame.removeEventListener('pointerdown', onPointerDown, true);
    window.removeEventListener('pointermove', onPointerMove, true);
    window.removeEventListener('pointerup', onPointerUp, true);
    window.removeEventListener('pointercancel', onPointerUp, true);
    frame.removeEventListener('wheel', onWheel);
  };
}
