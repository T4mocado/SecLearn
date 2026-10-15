/**
 * Scrolls only `container`, never its ancestors. `element.scrollIntoView()` also scrolls every
 * scrollable ancestor, including `overflow: hidden` ones: with the sources panel open it shifted the
 * whole app shell up by the 49px account strip (docs/ERRORS.md #23).
 */
export function scrollToEnd(container: HTMLElement, smooth = true): void {
  container.scrollTo({ top: container.scrollHeight, behavior: smooth ? "smooth" : "auto" });
}

/** Like `scrollIntoView({ block: "nearest" })`, limited to `container`. */
export function scrollIntoContainer(container: HTMLElement, element: HTMLElement, margin = 8): void {
  const box = container.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  let top: number | null = null;
  if (rect.top < box.top || rect.height > box.height) top = container.scrollTop + rect.top - box.top - margin;
  else if (rect.bottom > box.bottom) top = container.scrollTop + rect.bottom - box.bottom + margin;
  if (top !== null) container.scrollTo({ top, behavior: "smooth" });
}
