import type { DomDocument } from '../../ports.ts';
import { absolute, secure } from '../../text.ts';

const PLACEHOLDER = /bg_transparency|^data:|\.gif($|\?)/i;

// The images of an episode. The viewer loads them lazily: `src` holds a blank
// placeholder and the real address sits in `data-url`.
export class WebtoonViewer {
  images(doc: DomDocument, pageUrl: string): string[] {
    const inViewer = [...doc.querySelectorAll('#_imageList img')];
    const candidates = inViewer.length > 0 ? inViewer : [...doc.querySelectorAll('img[data-url]')];
    const addresses: string[] = [];
    for (const img of candidates) {
      const lazy = img.getAttribute('data-url');
      const shown = img.getAttribute('src');
      const address = absolute(lazy || (shown && !PLACEHOLDER.test(shown) ? shown : null), pageUrl);
      if (address) addresses.push(secure(address));
    }
    return addresses;
  }
}
