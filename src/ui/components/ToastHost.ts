import type { Toaster } from '../core/AppContext.ts';
import { h } from '../core/dom.ts';

const STAYS_MS = 2600;
const LEAVES_MS = 300;

/** Short messages that appear above the dock and go away by themselves. */
export class ToastHost implements Toaster {
  private readonly host: HTMLElement;

  constructor(host: HTMLElement) {
    this.host = host;
  }

  show(message: string): void {
    const toast = h('div', { class: 'toast', role: 'status' }, message);
    this.host.append(toast);
    setTimeout(() => {
      toast.dataset.leaving = 'true';
    }, STAYS_MS);
    setTimeout(() => toast.remove(), STAYS_MS + LEAVES_MS);
  }
}
