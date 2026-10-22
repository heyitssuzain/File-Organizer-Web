/**
 * Pointer-based queue reordering shared by the tool pages.
 *
 * Desktop: drag a row from anywhere on it.
 * Touch: drag from the handle only, so the list can still be scrolled normally.
 *
 * Targeting is computed against a layout snapshot taken when the drag starts,
 * so the row list cannot oscillate while the dragged row moves under the
 * pointer. Rows are moved in the DOM during the drag and the final order is
 * committed once on release.
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

interface SnapshotBand {
  el: HTMLElement;
  /** Page-space (scroll-inclusive) vertical band of the row at drag start. */
  top: number;
  bottom: number;
}

interface DragState {
  el: HTMLElement;
  startY: number;
  pointerId: number;
  active: boolean;
  snapshot: SnapshotBand[];
}

export function enablePointerReorder(options: PointerReorderOptions): void {
  const { queue } = options;
  const rowSelector = options.rowSelector ?? '.queue-row';
  const handleSelector = options.handleSelector ?? '[data-drag]';
  const rowQuery = `${rowSelector}[data-id]`;

  let drag: DragState | null = null;

  const orderedRows = (): HTMLElement[] => [...queue.querySelectorAll<HTMLElement>(rowQuery)];

  /** Page-space band snapshot of every row except the dragged one. */
  const snapshotAround = (dragged: HTMLElement): SnapshotBand[] => {
    const scrollY = window.scrollY;
    return orderedRows()
      .filter((el) => el !== dragged)
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return { el, top: rect.top + scrollY, bottom: rect.bottom + scrollY };
      });
  };

  /**
   * Where the dragged row should go for a pointer position, using the frozen
   * snapshot bands (so a moved row cannot flip-flop the target).
   */
  const targetFor = (pageY: number): { row: HTMLElement; after: boolean } | null => {
    const bands = drag?.snapshot ?? [];
    if (bands.length === 0) return null;
    for (const band of bands) {
      if (pageY >= band.top && pageY < band.bottom) {
        const mid = (band.top + band.bottom) / 2;
        return { row: band.el, after: pageY >= mid };
      }
    }
    const first = bands[0]!;
    const last = bands[bands.length - 1]!;
    if (pageY < first.top) return { row: first.el, after: false };
    if (pageY >= last.bottom) return { row: last.el, after: true };
    // In a gap between two bands: attach to the nearer upper row.
    for (let i = 0; i < bands.length - 1; i++) {
      if (pageY >= bands[i]!.bottom && pageY < bands[i + 1]!.top) {
        return { row: bands[i + 1]!.el, after: false };
      }
    }
    return null;
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
    drag = {
      el: row,
      startY: event.clientY,
      pointerId: event.pointerId,
      active: false,
      snapshot: [],
    };
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const state = drag;
    const pageY = event.clientY + window.scrollY;

    if (!state.active) {
      if (Math.abs(event.clientY - state.startY) < 6) return;
      state.active = true;
      state.snapshot = snapshotAround(state.el);
      state.el.classList.add('dragging');
      document.body.style.cursor = 'grabbing';
    }
    event.preventDefault();

    // Keep the dragged row reachable when the queue is taller than the screen.
    const margin = 56;
    if (event.clientY < margin) window.scrollBy(0, -22);
    else if (event.clientY > window.innerHeight - margin) window.scrollBy(0, 22);

    const target = targetFor(pageY);
    if (!target) return;

    // Apply the move only when it actually changes the row's DOM position, so
    // repeated pointer moves inside one band never fight each other.
    const rows = orderedRows();
    const from = rows.indexOf(state.el);
    let to = rows.indexOf(target.row);
    if (from < 0 || to < 0) return;
    if (target.after) to += 1;
    if (from === to) return;
    if (from < to) to -= 1;
    const parent = target.row.parentElement;
    const reference = rows[to] ?? null;
    if (parent && reference !== state.el) parent.insertBefore(state.el, reference);
  };

  const finish = (event: PointerEvent): void => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const current = drag;
    drag = null;
    document.body.style.cursor = '';
    if (!current.active) return;
    current.el.classList.remove('dragging');
    options.onCommit(orderedRows().map((el) => Number(el.dataset.id)));
  };

  queue.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove, { passive: false });
  window.addEventListener('pointerup', finish);
  window.addEventListener('pointercancel', finish);
}
