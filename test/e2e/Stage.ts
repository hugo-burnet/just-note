import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { createAppServer } from '../../proxy/node.ts';
import { ProxyApi } from '../../proxy/ProxyApi.ts';
import { StaticFiles } from '../../proxy/StaticFiles.ts';
import type { PretendWeb } from './PretendWeb.ts';

/** Where GitHub Pages serves a project site: under the name of the repository. */
const BASE_PATH = '/just-note/';
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const VITE = fileURLToPath(new URL('../../node_modules/vite/bin/vite.js', import.meta.url));
const SITE = fileURLToPath(new URL('../../test-output/site/', import.meta.url));

const listen = (server: Server): Promise<number> =>
  new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port)));

/**
 * The deployment under test, laid out as the real one: the built app under
 * /just-note/ on one address (GitHub Pages), the proxy with the pretend web
 * behind it on another (a Worker). They are different origins, so CORS and the
 * service worker's handling of a cross-origin proxy are really exercised.
 */
export class Stage {
  readonly appUrl: string;
  readonly proxyOrigin: string;
  private readonly servers: readonly Server[];
  private running = true;

  private constructor(appUrl: string, proxyOrigin: string, servers: readonly Server[]) {
    this.appUrl = appUrl;
    this.proxyOrigin = proxyOrigin;
    this.servers = servers;
  }

  static async open(web: PretendWeb): Promise<Stage> {
    // GitHub Pages lets a browser keep any file for ten minutes: the stage does the same.
    const files = new StaticFiles(SITE, { cacheControl: 'max-age=600' });
    const app = createServer((req, res) => {
      const { pathname } = new URL(req.url ?? '/', 'http://localhost');
      if (pathname.startsWith(BASE_PATH)) void files.serve(req, res, `/${pathname.slice(BASE_PATH.length)}`);
      else {
        res.writeHead(404);
        res.end();
      }
    });
    const appOrigin = `http://127.0.0.1:${await listen(app)}`;
    const proxy = createAppServer({ api: new ProxyApi({ fetch: web.fetch, corsOrigin: appOrigin }) });
    const proxyOrigin = `http://127.0.0.1:${await listen(proxy)}`;
    Stage.deploy(proxyOrigin, 'e2e-1');
    return new Stage(`${appOrigin}${BASE_PATH}`, proxyOrigin, [app, proxy]);
  }

  /** The same build the Pages workflow makes: the proxy's address is baked in. */
  private static deploy(proxyOrigin: string, version: string): void {
    execFileSync(process.execPath, [VITE, 'build', '--outDir', SITE, '--emptyOutDir'], {
      cwd: ROOT,
      env: { ...process.env, VITE_PROXY_URL: proxyOrigin, APP_VERSION: version },
      stdio: 'pipe',
    });
  }

  /** Deploys again, as Pages does: the files of the old build are gone, the new ones take their place. */
  redeploy(version: string): void {
    Stage.deploy(this.proxyOrigin, version);
  }

  /**
   * "Offline", for real: Playwright's setOffline() does not cut a service
   * worker's own requests, so the servers go away.
   */
  async goOffline(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    await Promise.all(
      this.servers.map(
        (server) =>
          new Promise<void>((resolve) => {
            server.close(() => resolve());
            server.closeAllConnections();
          }),
      ),
    );
  }
}
