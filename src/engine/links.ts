/** Pulls the first link out of whatever was pasted or shared ("Title https://…"). */
export function extractUrl(input: string | null | undefined): string | null {
  const text = String(input ?? '').trim();
  const link = /https?:\/\/[^\s<>"']+/i.exec(text);
  if (link) return link[0].replace(/[).,;]+$/, '');
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(text)) return `https://${text}`;
  return null;
}
