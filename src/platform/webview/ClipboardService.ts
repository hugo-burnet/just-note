import type { Clipboard } from '../Platform.ts';

/** The browser's clipboard, which only answers when the user has allowed it. */
export class ClipboardService implements Clipboard {
  async readText(): Promise<string | null> {
    try {
      return await navigator.clipboard.readText();
    } catch {
      return null;
    }
  }

  async writeText(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }
}
