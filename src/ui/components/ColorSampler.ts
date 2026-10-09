export interface Tint {
  /** Hue in degrees, in the OKLCH colour space. */
  readonly hue: number;
  /** How colourful the image is, 0 for a grey one. */
  readonly chroma: number;
}

const SIZE = 24;
const MIN_COLOUR = 0.6;

const linear = (channel: number): number => {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};

// sRGB to the a and b axes of OKLab (the a/b plane is where hue and chroma live).
function oklabAB(r: number, g: number, b: number): [number, number] {
  const lr = linear(r);
  const lg = linear(g);
  const lb = linear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

/**
 * Finds the dominant colour of a cover, so that the page it opens can be lit
 * with it. Reading pixels needs an image the page may read (the blob: addresses
 * the app makes for the pictures it downloads itself); when it may not, there is
 * simply no tint and the page keeps the app's accent.
 */
export class ColorSampler {
  private readonly cache = new Map<string, Tint | null>();

  sample(src: string): Promise<Tint | null> {
    const known = this.cache.get(src);
    if (known !== undefined) return Promise.resolve(known);
    return new Promise((resolve) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      const done = (tint: Tint | null): void => {
        this.cache.set(src, tint);
        resolve(tint);
      };
      image.onload = () => done(this.read(image));
      image.onerror = () => done(null);
      image.src = src;
    });
  }

  private read(image: HTMLImageElement): Tint | null {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = SIZE;
      canvas.height = SIZE;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return null;
      context.drawImage(image, 0, 0, SIZE, SIZE);
      const { data } = context.getImageData(0, 0, SIZE, SIZE);

      // A circular mean of the hues, each pixel weighing as much as it is colourful:
      // the greys and the blacks of a page must not decide.
      let x = 0;
      let y = 0;
      let weights = 0;
      for (let i = 0; i < data.length; i += 4) {
        const [a, b] = oklabAB(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0);
        const chroma = Math.hypot(a, b);
        x += a;
        y += b;
        weights += chroma;
      }
      const pixels = data.length / 4;
      if (weights / pixels < 0.02 || Math.hypot(x, y) / pixels < 0.01) return null;
      const chroma = Math.hypot(x, y) / pixels;
      return { hue: ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360, chroma: Math.min(chroma * MIN_COLOUR + 0.06, 0.2) };
    } catch {
      return null; // a canvas tainted by an image without CORS headers refuses to be read
    }
  }
}

/** Lights an element (and what it contains) with a cover's colour. */
export function applyTint(element: HTMLElement, tint: Tint): void {
  const root = document.documentElement.dataset.theme;
  const light = root === 'light' || (root === undefined && matchMedia('(prefers-color-scheme: light)').matches);
  const chroma = Math.min(Math.max(tint.chroma, 0.09), 0.18);
  element.style.setProperty('--accent', `oklch(${light ? 0.62 : 0.78} ${chroma} ${tint.hue})`);
  element.style.setProperty('--accent-strong', `oklch(${light ? 0.55 : 0.7} ${chroma * 1.1} ${tint.hue})`);
}
