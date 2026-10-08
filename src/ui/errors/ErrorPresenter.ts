import type { I18n } from '../i18n/I18n.ts';

export interface ErrorText {
  readonly title: string;
  readonly hint: string;
}

interface ErrorLike {
  name?: string;
  code?: string;
  message?: string;
  status?: number;
  upstreamStatus?: number;
  host?: string;
  proxy?: string;
  debug?: unknown;
}

// Which text (error.<name>.title / .hint) goes with which code.
const TEXT_FOR_CODE: Readonly<Record<string, string>> = {
  offline: 'offline',
  network: 'noProxy',
  no_proxy: 'noProxy',
  host_not_allowed: 'hostNotAllowed',
  timeout: 'timeout',
  blocked: 'blocked',
  no_chapters: 'layout',
  no_pages: 'layout',
  age_gated: 'ageGated',
  unsupported: 'unsupported',
  upstream_unreachable: 'unreachable',
  too_many_redirects: 'unreachable',
};

/** Turns whatever went wrong into words for the user, and into details they can send back. */
export class ErrorPresenter {
  private readonly i18n: I18n;

  constructor(i18n: I18n) {
    this.i18n = i18n;
  }

  describe(error: unknown): ErrorText {
    const failure = error as ErrorLike;
    let name = TEXT_FOR_CODE[failure.code ?? ''];
    if (failure.code === 'upstream_status') {
      const status = failure.upstreamStatus;
      name = status === 403 || status === 503 ? 'refused' : status === 404 ? 'notFound' : 'upstream';
    }
    const params = { host: failure.host ?? '', status: failure.upstreamStatus ?? '', proxy: failure.proxy ?? '' };
    const title = name ? this.i18n.lookup(`error.${name}.title`, params) : undefined;
    const hint = name ? this.i18n.lookup(`error.${name}.hint`, params) : undefined;
    return {
      title: title ?? this.i18n.t('error.generic.title'),
      hint: hint ?? this.i18n.t('error.generic.hint'),
    };
  }

  /** What "copy details" puts on the clipboard when a site changes under an adapter. */
  report(error: unknown): string {
    const failure = error as ErrorLike;
    return JSON.stringify(
      {
        error: failure.name,
        code: failure.code,
        message: failure.message,
        status: failure.status,
        upstreamStatus: failure.upstreamStatus,
        host: failure.host,
        proxy: failure.proxy,
        debug: failure.debug,
        page: location.hash,
        agent: navigator.userAgent,
        at: new Date().toISOString(),
      },
      null,
      2,
    );
  }
}
