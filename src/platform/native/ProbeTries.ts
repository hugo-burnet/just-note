import { isChallenge } from './Challenge.ts';
import type { Credentials } from './CredentialJar.ts';
import type { NativeHttp, NativeResponse } from './NativeHttp.ts';
import { OpenPolicy } from './OpenPolicy.ts';
import { SiteClient } from './SiteClient.ts';

const TRIED_REQUESTS = 3;
const FILE_THAT_IS_NOT_DATA = /\.(?:css|js|woff2?|otf|ttf|ico|svg)(?:\?|$)/i;
const isJson = (address: string): boolean => /\.json(?:\?|$)/i.test(address);

/** A page as the report has it, and who read it. */
export interface ReadablePage {
  readonly label: string;
  readonly html: string;
}

/** What a request is sent with besides what the jar gives: for finding out what a server wants to see. */
class WithHeaders implements Credentials {
  private readonly inner: Credentials;
  private readonly extra: Readonly<Record<string, string>>;

  constructor(inner: Credentials, extra: Readonly<Record<string, string>>) {
    this.inner = inner;
    this.extra = extra;
  }

  headersFor(host: string): Readonly<Record<string, string>> {
    return { ...this.inner.headersFor(host), ...this.extra };
  }
}

// What a server may want to see on a request for a picture, tried one after the other.
const VARIANTS: ReadonlyArray<readonly [string, (origin: string, page: string) => Record<string, string>]> = [
  ['Referer: the site', () => ({})],
  ['Referer: the site, Origin: the site', (origin) => ({ Origin: origin })],
  ['Referer: the page, Origin: the site', (origin, page) => ({ Origin: origin, Referer: page })],
  ['no Referer', () => ({ Referer: '' })],
];

const kilobytes = (bytes: number): number => Math.round(bytes / 1024);

/** The first bytes of an answer, as a reader sees them: in hexadecimal, and as the letters they are when they are letters. */
function peek(response: NativeResponse, binary: boolean): string {
  let bytes: Uint8Array = new TextEncoder().encode(response.body.slice(0, 24));
  if (binary) {
    try {
      bytes = Uint8Array.from(atob(response.body.slice(0, 32)), (letter) => letter.charCodeAt(0));
    } catch {
      // Not base64 after all: it stays the text it came as.
    }
  }
  const hex = [...bytes.slice(0, 8)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  const letters = [...bytes.slice(0, 24)].map((byte) => (byte >= 32 && byte < 127 ? String.fromCharCode(byte) : '.')).join('');
  return `${hex} ${letters}`;
}

/**
 * What the phone's own network is answered when it asks, as a page did, for what the page requested of the
 * other hosts of its own site (not its style sheets and scripts): where its data and its pictures come from,
 * whether they come as they are, what the server wants to see before it gives them, and whether the page
 * itself holds their names. It is what tells if a site can be read without running its scripts.
 */
export class DataTries {
  private readonly http: NativeHttp;
  private readonly credentials: Credentials;

  /** `credentials`: what the WebView earned on the page. */
  constructor(http: NativeHttp, credentials: Credentials) {
    this.http = http;
    this.credentials = credentials;
  }

  async run(page: URL, requests: readonly string[], pages: readonly ReadablePage[]): Promise<string[]> {
    const wanted = this.wanted(page, requests);
    if (wanted.length === 0) return [];
    const lines = [`--- the phone's own network, asked for what the page requested of its site (${wanted.length})`];
    for (const address of wanted) lines.push(await this.ask(this.http, this.credentials, address, page, `${page.origin}/`), address);
    const picture = wanted.find((address) => !isJson(address));
    if (picture) lines.push(...(await this.variants(picture, page)), ...this.written(picture, pages));
    return lines;
  }

  private wanted(page: URL, requests: readonly string[]): string[] {
    const domain = page.hostname.split('.').slice(-2).join('.');
    const seen = new Set<string>();
    const wanted: string[] = [];
    for (const request of requests) {
      const [method, address = ''] = request.split(' ');
      let target: URL;
      try {
        target = new URL(address);
      } catch {
        continue;
      }
      const kind = `${target.hostname}/${target.pathname.split('/').slice(1, 3).join('/').replace(/\d+/g, '#')}`;
      const own = target.hostname.endsWith(domain) && target.hostname !== page.hostname && !target.hostname.startsWith('static.');
      if (method !== 'GET' || !own || FILE_THAT_IS_NOT_DATA.test(target.pathname) || seen.has(kind)) continue;
      seen.add(kind);
      wanted.push(target.href);
      if (wanted.length === TRIED_REQUESTS) break;
    }
    return wanted;
  }

  /** One request, and what it was answered, in a line. */
  private async ask(http: NativeHttp, credentials: Credentials, address: string, page: URL, referer: string): Promise<string> {
    const text = isJson(address);
    try {
      const { response } = await new SiteClient(http, new OpenPolicy(), credentials).exchange(address, text ? 'text' : 'image', referer);
      // A picture arrives as base64; an error page, whatever it was asked for, as the text it is.
      const binary = !text && response.status >= 200 && response.status < 300;
      const size = kilobytes(binary ? response.body.length * 0.75 : response.body.length);
      const check = isChallenge(response) ? ', the check' : '';
      return `${response.status}${check} ${response.headers['content-type'] ?? '(no type)'}, ${size} KB, starts with ${peek(response, binary)}`;
    } catch (error) {
      return `no answer (${(error as { code?: unknown }).code ?? 'error'})`;
    }
  }

  private async variants(address: string, page: URL): Promise<string[]> {
    const lines = ['--- the first picture, asked for with what a server may want to see'];
    for (const [label, headers] of VARIANTS) {
      const credentials = new WithHeaders(this.credentials, headers(page.origin, page.href));
      lines.push(`${label}: ${await this.ask(this.http, credentials, address, page, `${page.origin}/`)}`);
    }
    return lines;
  }

  /** Whether the name of the first picture is written in the page, which makes the list of a chapter something to read, not to run. */
  private written(address: string, pages: readonly ReadablePage[]): string[] {
    const name = decodeURIComponent(new URL(address).pathname.split('/').pop() ?? '').replace(/\.[a-z0-9]+$/i, '');
    if (name.length < 8) return [];
    const lines = [`--- is the name of the first picture (${name}) written in the page?`];
    for (const { label, html } of pages) {
      const at = html.indexOf(name);
      lines.push(`${label}: ${at < 0 ? 'no' : `yes, around: ${html.slice(Math.max(0, at - 100), at + name.length + 60).replace(/\s+/g, ' ')}`}`);
    }
    return lines;
  }
}
