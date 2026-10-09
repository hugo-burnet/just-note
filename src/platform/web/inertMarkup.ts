/** Foreign CSS is irrelevant to extraction and would trigger the app's strict CSP during parsing. */
export function inertMarkup(html: string): string {
  // Keep comments and raw text intact: chapter scripts contain image lists the sources read.
  const tokens = /<!--[\s\S]*?(?:-->|$)|<(script|style|textarea|title)\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/\1\s*>|<\/?[a-z][^>"']*(?:(?:"[^"]*"|'[^']*')[^>"']*)*>/gi;
  return html.replace(tokens, (tag: string, raw: string | undefined) => {
    if (tag.startsWith('<!--')) return tag;
    if (raw?.toLowerCase() === 'style') return '';
    if (raw) {
      const opening = tag.match(/^<(?:[^>"']|"[^"]*"|'[^']*')*>/)?.[0] ?? '';
      return attributes(opening) + tag.slice(opening.length);
    }
    return attributes(tag);
  });
}

function attributes(tag: string): string {
  // Match whole attributes so a title, URL or script value containing " style=" is left intact.
  return tag.replace(/[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/g, (attribute) => {
    const name = attribute.match(/^[^\s=]+/)?.[0];
    return name?.toLowerCase() === 'style' ? attribute.replace(/^style/i, 'data-jr-original-style') : attribute;
  });
}
