import type { Browser } from 'playwright';

export interface PictureStyle {
  readonly count: number;
  readonly width: number;
  readonly height: number;
  /** Where the colours start on the colour wheel, so that two sites do not look alike. */
  readonly hue: number;
}

/** Made-up pages: a colour and a number, drawn by the browser itself, so no real artwork is involved. */
export class Pictures {
  private readonly images: readonly Buffer[];

  constructor(images: readonly Buffer[]) {
    this.images = images;
  }

  static async draw(browser: Browser, style: PictureStyle): Promise<Pictures> {
    const page = await browser.newPage({ viewport: { width: style.width, height: style.height } });
    const images: Buffer[] = [];
    for (let n = 1; n <= style.count; n++) {
      const hue = (style.hue + n * 47) % 360;
      await page.setContent(
        `<body style="margin:0;display:grid;place-items:center;height:${style.height}px;background:linear-gradient(160deg,hsl(${hue} 60% 84%),hsl(${hue + 30} 55% 70%));font:700 ${Math.round(style.width / 3)}px system-ui;color:#2a2230">${n}</body>`,
      );
      images.push(await page.screenshot());
    }
    await page.close();
    return new Pictures(images);
  }

  /** The n-th picture (counting from 1), over and over when there are fewer than asked for. */
  response(n: number): Response {
    const image = this.images[(Math.max(1, n) - 1) % this.images.length] ?? Buffer.alloc(0);
    return new Response(new Uint8Array(image), { headers: { 'content-type': 'image/png' } });
  }
}

/** The number in the file name ("…/3.png"), 1 when there is none. */
export const numberIn = (path: string): number => Number(/(\d+)\.(?:png|jpg)/.exec(path)?.[1] ?? 1);
