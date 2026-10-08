// Node entry: the proxy, plus the built app when STATIC_DIR is set.
//   npm start                            API only: http://127.0.0.1:8787
//   STATIC_DIR=dist npm start            API + the built app, in one process
//   PORT=8080 npm start                  listens on every interface, as hosts expect
//   HOST=127.0.0.1 PORT=8080 npm start   stays private even with PORT set
//   PROXY_EXTRA_HOSTS=cdn.example.com    more allowed hosts ("site:host" picks the site)
//   CORS_ORIGIN=https://you.github.io    when the app is served from another address
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { HostPolicy } from './HostPolicy.ts';
import { sendResponse, toRequest } from './nodeAdapter.ts';
import { ProxyApi } from './ProxyApi.ts';
import { StaticFiles } from './StaticFiles.ts';

export interface AppServerOptions {
  api: ProxyApi;
  staticFiles?: StaticFiles;
}

export function createAppServer({ api, staticFiles }: AppServerOptions): Server {
  return createServer(async (req, res) => {
    try {
      const request = toRequest(req);
      if (!request) {
        res.writeHead(400);
        res.end();
        return;
      }
      const response = await api.handle(request);
      if (response) await sendResponse(res, response);
      else if (staticFiles) await staticFiles.serve(req, res, new URL(request.url).pathname);
      else {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Not found');
      }
    } catch (err) {
      console.error(err);
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain' });
      res.end('Internal error');
    }
  });
}

function main(): void {
  const policy = new HostPolicy().withExtraHosts(process.env.PROXY_EXTRA_HOSTS);
  const api = new ProxyApi({ policy, corsOrigin: process.env.CORS_ORIGIN || null });
  const staticDir = process.env.STATIC_DIR;
  const staticFiles = staticDir ? new StaticFiles(resolve(staticDir)) : undefined;
  const port = Number(process.env.PORT ?? 8787);
  // Hosting platforms hand us a PORT and need us to listen on every interface.
  const host = process.env.HOST ?? (process.env.PORT ? '0.0.0.0' : '127.0.0.1');
  createAppServer({ api, staticFiles }).listen(port, host, () => {
    console.log(`Just Read proxy on http://${host}:${port}${staticFiles ? ' (serving the app as well)' : ''}`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
