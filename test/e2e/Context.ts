import type { Browser } from 'playwright';
import type { PretendWeb } from './PretendWeb.ts';
import type { Runner } from './Runner.ts';
import type { Stage } from './Stage.ts';

/** What every flow of the end-to-end run is given. */
export interface Context {
  readonly browser: Browser;
  readonly stage: Stage;
  readonly web: PretendWeb;
  readonly runner: Runner;
}
