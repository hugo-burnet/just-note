// Cloudflare Workers entry. GitHub Pages only serves static files, so when the
// app lives there the proxy runs here (deploy with `npx wrangler deploy`).
//
//   CORS_ORIGIN         the Pages origin, e.g. https://you.github.io (no path)
//   PROXY_EXTRA_HOSTS   more allowed hosts, same syntax as the Node entry
import { HostPolicy } from './HostPolicy.ts';
import { ProxyApi } from './ProxyApi.ts';

interface Env {
  CORS_ORIGIN?: string;
  PROXY_EXTRA_HOSTS?: string;
}

let api: ProxyApi | undefined;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    api ??= new ProxyApi({
      policy: new HostPolicy().withExtraHosts(env.PROXY_EXTRA_HOSTS),
      corsOrigin: env.CORS_ORIGIN || null,
    });
    return (await api.handle(request)) ?? new Response('Not found', { status: 404 });
  },
};
