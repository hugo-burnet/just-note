export type Child = Node | string | number | false | null | undefined;
export type Handler = (event: Event) => void;
export type AttrValue = string | number | boolean | null | undefined | Handler;
export type Attrs = Record<string, AttrValue>;

// The app never turns third-party text into markup: it builds elements and sets
// text, so a hostile page cannot inject anything.

/** Builds an element: `on…` attributes are listeners, the others plain attributes. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs | null = null,
  ...children: Array<Child | readonly Child[]>
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (typeof value === 'function') el.addEventListener(name.slice(2), value);
    else el.setAttribute(name, value === true ? '' : String(value));
  }
  append(el, children);
  return el;
}

export function append(parent: Element | DocumentFragment, children: ReadonlyArray<Child | readonly Child[]>): void {
  for (const child of children.flat() as Child[]) {
    if (child === null || child === undefined || child === false) continue;
    parent.append(typeof child === 'number' ? String(child) : child);
  }
}

/** Sets a CSS custom property, which is how views hand colours to their stylesheet. */
export const setVar = (el: HTMLElement, name: string, value: string): void => el.style.setProperty(name, value);

/** Runs `callback` once the browser painted what was just added, which is when a transition can start. */
export const nextFrame = (callback: () => void): void => {
  requestAnimationFrame(() => requestAnimationFrame(callback));
};
