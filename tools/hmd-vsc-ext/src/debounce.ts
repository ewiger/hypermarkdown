/** Timing shared by the preview and the diagnostics publisher (HMD-0021 §6). */

/** Milliseconds after the last keystroke before the preview re-parses (§6). */
export const REPARSE_DEBOUNCE_MS = 150;

/** A trailing-edge debounce that can be cancelled on dispose. */
export function debounce<T extends unknown[]>(
  ms: number,
  fn: (...args: T) => void,
): ((...args: T) => void) & { cancel(): void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const wrapped = (...args: T): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
  wrapped.cancel = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  return wrapped;
}
