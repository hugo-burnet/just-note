import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';
import type { PretendWeb } from './PretendWeb.ts';

const BASE_PATH = '/just-note/';
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const VITE = fileURLToPath(new URL('../../node_modules/vite/bin/vite.js', import.meta.url));
const SITE = fileURLToPath(new URL('../../test-output/site/', import.meta.url));
// Where the app's requests to the sites go in a test: see TestApp.ts.
export const NETWORK_PATH = `${BASE_PATH}__net`;

const TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
};

const listen = (server: Server): Promise<number> =>
  new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port)));

/** What the app asks of the phone's network (NativeRequest), as the test app sends it here. */
interface Asked {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly as: 'text' | 'bytes';
}

/**
 * The app under test: the build that goes in the APK, served as Capacitor serves it (from one
 * origin, with its own files), but composed by TestApp.ts instead of main.ts. What the app would
 * ask of the phone's network comes here instead, and the pretend web answers it: no real site
 * is ever reached. Its own files stay served when the "network" goes away (see TestApp.ts).
 */
export class Stage {
  readonly appUrl: string;
  private readonly server: Server;

  private constructor(appUrl: string, server: Server) {
    this.appUrl = appUrl;
    this.server = server;
  }

  static async open(web: PretendWeb): Promise<Stage> {
    Stage.build();
    const server = createServer((req, res) => void Stage.serve(web, req, res));
    return new Stage(`http://127.0.0.1:${await listen(server)}${BASE_PATH}`, server);
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.server.close(() => resolve());
      this.server.closeAllConnections();
    });
  }

  /** The APK's files, as `npm run build` makes them, and the test composition beside them. */
  private static build(): void {
    execFileSync(process.execPath, [VITE, 'build', '--outDir', SITE, '--emptyOutDir'], {
      cwd: ROOT,
      env: { ...process.env, APP_VERSION: 'e2e' },
      stdio: 'pipe',
    });
    buildSync({ absWorkingDir: ROOT, entryPoints: ['test/e2e/TestApp.ts'], outfile: `${SITE}test-app.js`, bundle: true, format: 'esm', target: 'es2022',
      define: { __APP_VERSION__: JSON.stringify('e2e') } });
  }

  private static async serve(web: PretendWeb, req: IncomingMessage, res: ServerResponse): Promise<void> {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost');
    if (pathname === NETWORK_PATH && req.method === 'POST') return Stage.network(web, req, res);
    if (!pathname.startsWith(BASE_PATH)) return Stage.answer(res, 404, 'text/plain', 'not found');
    const file = normalize(pathname.slice(BASE_PATH.length) || 'index.html');
    if (file.startsWith('..')) return Stage.answer(res, 404, 'text/plain', 'not found');
    try {
      let body: Buffer | string = await readFile(`${SITE}${file}`);
      // The page starts the test composition instead of the production one, with the same markup and styles.
      if (file === 'index.html') body = body.toString('utf8').replace(/<script type="module"[^>]*src="[^"]*assets\/index-[^"]+\.js"[^>]*><\/script>/, '<script type="module" src="./test-app.js"></script>');
      Stage.answer(res, 200, TYPES[extname(file)] ?? 'application/octet-stream', body);
    } catch {
      Stage.answer(res, 404, 'text/plain', 'not found');
    }
  }

  /** One request of the app to a site, answered by the pretend web as the phone's network stack would hand it over. */
  private static async network(web: PretendWeb, req: IncomingMessage, res: ServerResponse): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const asked = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Asked;
    const referer = Object.entries(asked.headers).find(([name]) => name.toLowerCase() === 'referer')?.[1];
    const answer = await web.fetch(asked.url, { headers: referer ? { referer } : {} });
    const headers: Record<string, string> = {};
    answer.headers.forEach((value, name) => (headers[name.toLowerCase()] = value));
    const bytes = Buffer.from(await answer.arrayBuffer());
    const body = asked.as === 'bytes' ? bytes.toString('base64') : bytes.toString('utf8');
    Stage.answer(res, 200, 'application/json', JSON.stringify({ status: answer.status, headers, body }));
  }

  private static answer(res: ServerResponse, status: number, type: string, body: Buffer | string): void {
    res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
    res.end(body);
  }
}
