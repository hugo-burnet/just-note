// A failure the proxy reports to the app as JSON { error, message, ...extra }.
export class ProxyError extends Error {
  readonly status: number;
  readonly code: string;
  readonly extra: Record<string, unknown>;

  constructor(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }

  static upstreamStatus(status: number): ProxyError {
    return new ProxyError(502, 'upstream_status', `The source answered ${status}.`, { upstreamStatus: status });
  }

  static tooLarge(): ProxyError {
    return new ProxyError(502, 'too_large', 'The source sent more data than allowed.');
  }
}
