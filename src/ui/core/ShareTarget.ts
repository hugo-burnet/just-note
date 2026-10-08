const FIELDS = ['url', 'text', 'title'] as const;

/**
 * A link shared to the installed app arrives in the address, as
 * `?url=…&text=…&title=…` (see share_target in the manifest). Apps differ on which
 * field they put the link in, so every one is a candidate.
 */
export class ShareTarget {
  static candidates(search: string): string[] {
    const query = new URLSearchParams(search);
    return FIELDS.map((field) => query.get(field)?.trim() ?? '').filter(Boolean);
  }
}
