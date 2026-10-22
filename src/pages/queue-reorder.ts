/**
 * Pointer-based queue reordering shared by the tool pages.
 *
 * Desktop: drag a row from anywhere on it.
 * Touch: drag from the handle only, so the list can still be scrolled normally.
 *
 * Rows are moved in the DOM while dragging (one layout pass per pointer move)
 * and the final order is committed once on release, instead of rebuilding the
 * whole queue on every event.
 */

export interface PointerReorderOptions {
  /** Container holding the rows. */
  queue: HTMLElement;
  /** While true, dragging is disabled (e.g. a job is running). */
  isBusy: () => boolean;
  /** Called once with the new row id order after a drag completes. */
  onCommit: (order: number[]) => void;
  /** Row selector. Defaults to `.queue-row`. */
  rowSelector?: string;
  /** Selector inside a row that may start a touch drag. Defaults to `[data-drag]`. */
  handleSelector?: string;
}

export function enablePointerReorder(options: PointerReorderOptions): void {
  const { queue } = options;
  const rowSelector = options.rowSelector ?? '.queue-row';
  const handleSelector = options.handleSelector ?? '[data-drag]';

  let drag: { el: HTMLElement; startY: number; pointerId: number; active: boolean } | null = null;

  const rowFromPoint = (x: number, y: number): HTMLElement | null => {
    const hit = document.elementFromPoint(x, y) as HTMLElement | null;
    const row = hit?.closest<HTMLElement>(rowSelector) ?? null;
    if (!row || row === drag?.el) return null;
    return row;
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (options.isBusy() || event.button !== 0) return;
    const target = event.target as HTMLElement;
    const row = target.closest<HTMLElement>(rowSelector);
    if (!row || !row.dataset.id) return;
    const fromHandle = Boolean(target.closest(handleSelector));
    // Touch drags only from the handle so the queue stays scrollable.
    if (event.pointerType === 'touch' && !fromHandle) return;
    // Buttons, selects and links keep their own behaviour.
    if (!fromHandle && target.closest('button, select, input, a')) return;
    drag = { el: row, startY: event.clientY, pointerId: event.pointerId, active: false };
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.active) {
      if (Math.abs(event.clientY - drag.startY) < 6) return;
      drag.active = true;
      drag.el.classList.add('dragging');
      document.body.style.cursor = 'grabbing';
    }
    event.preventDefault();

    // Keep the dragged row reachable when the queue is taller than the screen.
    const margin = 56;
    if (event.clientY < margin) window.scrollBy(0, -14);
    else if (event.clientY > window.innerHeight - margin) window.scrollBy(0, 14);

    const over = rowFromPoint(event.clientX, event.clientY);
    if (!over) return;
    const rect = over.getBoundingClientRect();
    const after = event.clientY > rect.top + rect.height / 2;
    over.parentElement?.insertBefore(drag.el, after ? over.nextSibling : over);
  };

  const finish = (event: PointerEvent): void => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const current = drag;
    drag = null;
    document.body.style.cursor = '';
    if (!current.active) return;
    current.el.classList.remove('dragging');
    const order = [...queue.querySelectorAll<HTMLElement>(`${rowSelector}[data-id]`)].map((el) =>
      Number(el.dataset.id),
    );
    options.onCommit(order);
  };

  queue.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove, { passive: false });
  window.addEventListener('pointerup', finish);
  window.addEventListener('pointercancel', finish);
}
