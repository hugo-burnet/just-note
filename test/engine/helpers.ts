import { readFileSync } from 'node:fs';
import { DOMParser } from 'linkedom';
import type { DomDocument, FetchedText, HtmlParser, KeyValueStore, SourceIO, TextRequest, Transport } from '../../src/engine/index.ts';

export class LinkedomParser implements HtmlParser {
  parse(html: string): DomDocument {
    return new DOMParser().parseFromString(html, 'text/html') as unknown as DomDocument;
  }
}

export const fixture = (name: string): string => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

export interface Asked {
  readonly url: string;
  readonly request: TextRequest | undefined;
}

export type Route = string | ((url: string, request: TextRequest | undefined) => string | Promise<string>);

/** A transport whose "internet" is a table of address to text (or function), recording what was asked. */
export class FakeTransport implements Transport {
  readonly asked: Asked[] = [];
  private readonly routes: Record<string, Route>;

  constructor(routes: Record<string, Route>) {
    this.routes = routes;
  }

  async text(url: string, request?: TextRequest): Promise<FetchedText> {
    this.asked.push({ url, request });
    const route = this.routes[url] ?? this.routes['*'];
    if (route === undefined) throw new Error(`unexpected fetch: ${url}`);
    const text = typeof route === 'function' ? await route(url, request) : route;
    return { text, url };
  }

  async imageSource(url: string): Promise<string> {
    return url;
  }
}

export function makeIO(routes: Record<string, Route>): { io: SourceIO; transport: FakeTransport } {
  const transport = new FakeTransport(routes);
  return { io: { transport, parser: new LinkedomParser() }, transport };
}

export class MemoryStore implements KeyValueStore {
  readonly data = new Map<string, string>();

  get(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  set(key: string, value: string): void {
    this.data.set(key, value);
  }

  remove(key: string): void {
    this.data.delete(key);
  }

  keys(): string[] {
    return [...this.data.keys()];
  }
}
