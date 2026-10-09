import { CapacitorHttp } from '@capacitor/core';
import type { NativeHttp, NativeRequest, NativeResponse } from './NativeHttp.ts';

/** The phone's HTTP stack through Capacitor: no CORS to obey, and any Referer to send. */
export class CapacitorNativeHttp implements NativeHttp {
  async get(request: NativeRequest): Promise<NativeResponse> {
    const res = await CapacitorHttp.get({
      url: request.url,
      headers: { ...request.headers },
      responseType: request.as === 'text' ? 'text' : 'blob',
      connectTimeout: request.timeoutMs,
      readTimeout: request.timeoutMs,
      disableRedirects: true,
    });
    const headers: Record<string, string> = {};
    for (const [name, value] of Object.entries(res.headers ?? {})) headers[name.toLowerCase()] = String(value);
    return { status: res.status, headers, body: typeof res.data === 'string' ? res.data : '' };
  }
}
