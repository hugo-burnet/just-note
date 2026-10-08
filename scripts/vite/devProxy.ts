import type { Plugin } from 'vite';
import { HostPolicy } from '../../proxy/HostPolicy.ts';
import { sendResponse, toRequest } from '../../proxy/nodeAdapter.ts';
import { ProxyApi } from '../../proxy/ProxyApi.ts';

/** `npm run dev` answers /api/ itself, with the same proxy as production, so there is nothing else to start. */
export function devProxy(): Plugin {
  return {
    name: 'just-read:dev-proxy',
    apply: 'serve',
    configureServer(server) {
      const api = new ProxyApi({ policy: new HostPolicy().withExtraHosts(process.env.PROXY_EXTRA_HOSTS) });
      server.middlewares.use(async (req, res, next) => {
        try {
          const request = toRequest(req);
          const response = request ? await api.handle(request) : null;
          if (response) await sendResponse(res, response);
          else next();
        } catch (error) {
          next(error);
        }
      });
    },
  };
}
