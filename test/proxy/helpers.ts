import { ProxyApi } from '../../proxy/ProxyApi.ts';
import type { ProxyOptions } from '../../proxy/ProxyApi.ts';

export interface Call {
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly redirect: RequestRedirect | undefined;
}

export type Responder = (url: string, count: number) => Response | Promise<Response>;

// A proxy whose "internet" is a function, recording what it was asked to fetch.
export function setup(responder: Responder, options: ProxyOptions = {}) {
  const calls: Call[] = [];
  const api = new ProxyApi({
    ...options,
    fetch: async (url, init) => {
      calls.push({ url, headers: init.headers as Record<string, string>, redirect: init.redirect });
      return responder(url, calls.length);
    },
  });

  async function get(path: string, init?: RequestInit): Promise<Response> {
    const res = await api.handle(new Request(`http://app.test${path}`, init));
    if (!res) throw new Error(`${path} is not an API route`);
    return res;
  }
  return { calls, get, api };
}

export const page = (body: BodyInit | null, init: ResponseInit = {}): Response =>
  new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8' }, ...init });

export const image = (type = 'image/jpeg', bytes: number[] = [1, 2, 3], headers: Record<string, string> = {}): Response =>
  new Response(new Uint8Array(bytes), { headers: { 'content-type': type, ...headers } });

export const htmlPath = (url: string, extra = ''): string => `/api/html?u=${encodeURIComponent(url)}${extra}`;
export const imgPath = (url: string): string => `/api/img?u=${encodeURIComponent(url)}`;

export const body = async (res: Response): Promise<Record<string, unknown>> => (await res.json()) as Record<string, unknown>;
