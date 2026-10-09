/** One GET, as the phone's own network stack is asked for it. */
export interface NativeRequest {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  /** `bytes`: the body comes back as base64, which is how Capacitor carries binary data across. */
  readonly as: 'text' | 'bytes';
  readonly timeoutMs: number;
}

export interface NativeResponse {
  readonly status: number;
  /** Header names in lower case. */
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

/**
 * The phone's HTTP stack. A redirect is an answer like any other (status and
 * `location`), not something followed behind the app's back: every address is
 * checked before it is asked for.
 */
export interface NativeHttp {
  get(request: NativeRequest): Promise<NativeResponse>;
}
