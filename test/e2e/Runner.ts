import { mkdir, readdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Page } from 'playwright';

const OUTPUT = fileURLToPath(new URL('../../test-output/', import.meta.url));

/** A small test runner: named steps that report as they go, and a screenshot of the page when one fails. */
export class Runner {
  readonly failures: string[] = [];
  private readonly pageErrors: string[] = [];
  private readonly policyViolations: string[] = [];
  private current: Page | null = null;

  /** Starts from an empty folder, so that a screenshot of an earlier run never passes for a new one. */
  async prepare(): Promise<void> {
    await mkdir(OUTPUT, { recursive: true });
    for (const name of await readdir(OUTPUT)) if (name.endsWith('.png')) await rm(`${OUTPUT}${name}`);
  }

  heading(title: string): void {
    console.log(`\n${title}`);
  }

  /** Starts watching a page: uncaught errors and security-policy violations count as failures. */
  watch(page: Page): Page {
    this.current = page;
    page.setDefaultTimeout(8000);
    page.on('pageerror', (error) => this.pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && /Content Security Policy|Refused to/i.test(message.text())) this.policyViolations.push(message.text());
    });
    return page;
  }

  async step(name: string, run: () => Promise<void>): Promise<void> {
    try {
      await run();
      console.log(`  ✓ ${name}`);
    } catch (error) {
      this.failures.push(name);
      const message = error instanceof Error ? error.message : String(error);
      console.log(`  ✗ ${name}\n      ${message.split('\n').slice(0, 5).join('\n      ')}`);
      await this.current?.screenshot({ path: `${OUTPUT}fail-${this.failures.length}.png` }).catch(() => {});
    }
  }

  shot(page: Page, name: string): Promise<Buffer> {
    return page.screenshot({ path: `${OUTPUT}${name}.png` });
  }

  /** Prints the verdict; the exit code of the run. */
  finish(): number {
    if (this.pageErrors.length > 0) this.failures.push(`uncaught page errors: ${this.pageErrors.join(' | ')}`);
    if (this.policyViolations.length > 0) this.failures.push(`security policy violations: ${this.policyViolations.join(' | ')}`);
    console.log(this.failures.length > 0 ? `\n${this.failures.length} problem(s):\n - ${this.failures.join('\n - ')}` : '\nAll good. Screenshots are in test-output/.');
    return this.failures.length > 0 ? 1 : 0;
  }
}
