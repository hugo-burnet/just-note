export interface TransportErrorDetails {
  status?: number;
  upstreamStatus?: number;
  host?: string;
}

/** The app could not get an answer, from the proxy or from the site through it. */
export class TransportError extends Error {
  readonly code: string;
  readonly status: number | undefined;
  readonly upstreamStatus: number | undefined;
  readonly host: string | undefined;

  constructor(code: string, message: string, details: TransportErrorDetails = {}) {
    super(message);
    this.name = 'TransportError';
    this.code = code;
    this.status = details.status;
    this.upstreamStatus = details.upstreamStatus;
    this.host = details.host;
  }
}

/**
 * A page was fetched but did not hold what a source expects. `code` drives the
 * message shown to the user; `debug` is what "copy details" puts on the
 * clipboard when a site changes under the adapter.
 */
export class SourceError extends Error {
  readonly code: string;
  readonly debug: Record<string, unknown>;

  constructor(code: string, message: string, debug: Record<string, unknown> = {}) {
    super(message);
    this.name = 'SourceError';
    this.code = code;
    this.debug = debug;
  }
}
