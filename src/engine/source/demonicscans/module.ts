import type { SiteModule } from '../Site.ts';
import { DemonicScansSource } from './DemonicScansSource.ts';

export const demonicscans: SiteModule = {
  id: 'demonicscans',
  name: 'Demonic Scans',
  // The pages; where the pictures of a chapter come from is not known yet (see README.md): a host of
  // theirs that is not this one is named by the app when it is refused, and is to be added here.
  hosts: ['demonicscans.org'],
  referer: 'https://demonicscans.org/',
  create: (io) => new DemonicScansSource(io),
};
