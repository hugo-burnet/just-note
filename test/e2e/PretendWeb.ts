/** One made-up website: answers the requests that are for it, and leaves the others alone. */
export interface Pretender {
  respond(url: URL): Response | null;
}

export interface Hit {
  readonly url: string;
  readonly referer: string | null;
}

export const page = (body: string, status = 200): Response =>
  new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });

/** The internet, as far as the app can see it in a test: a few pretend sites, and a record of what was asked of them. */
export class PretendWeb {
  readonly hits: Hit[] = [];
  private readonly sites: readonly Pretender[];

  constructor(sites: readonly Pretender[]) {
    this.sites = sites;
  }

  readonly fetch = async (input: string, init: { readonly headers: Readonly<Record<string, string>> }): Promise<Response> => {
    this.hits.push({ url: input, referer: init.headers['referer'] ?? null });
    const url = new URL(input);
    for (const site of this.sites) {
      const response = site.respond(url);
      if (response) return response;
    }
    return page('not found', 404);
  };

  hitsFor(fragment: string): Hit[] {
    return this.hits.filter((hit) => hit.url.includes(fragment));
  }
}
