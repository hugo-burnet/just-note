// Test-only: a packer in the Dean Edwards format, and a reference "runner" that
// lets a real JS engine decode the result, so the decoder is checked against the
// semantics it imitates. Nothing here ships to the app.
import { runInNewContext } from 'node:vm';

const literal = (s: string): string => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r');

export function pack(source: string, options: { radix?: number } = {}): string {
  const radix = options.radix ?? 62;
  const encode = (n: number): string => {
    const head = n < radix ? '' : encode(Math.floor(n / radix));
    const digit = n % radix;
    return head + (digit > 35 ? String.fromCharCode(digit + 29) : digit.toString(36));
  };
  const words = [...new Set(source.match(/\w+/g) ?? [])];
  const codes = new Map(words.map((word, i) => [word, encode(i)]));
  const payload = source.replace(/\w+/g, (word) => codes.get(word) ?? word);
  // Like the real packer, leave the slot empty when a word is its own code.
  const dictionary = words.map((word, i) => (encode(i) === word ? '' : word)).join('|');
  return `eval(function(p,a,c,k,e,d){e=function(c){return(c<a?'':e(parseInt(c/a)))+((c=c%a)>35?String.fromCharCode(c+29):c.toString(36))};if(!''.replace(/^/,String)){while(c--){d[e(c)]=k[c]||e(c)}k=[function(e){return d[e]}];e=function(){return'\\\\w+'};c=1};while(c--){if(k[c]){p=p.replace(new RegExp('\\\\b'+e(c)+'\\\\b','g'),k[c])}}return p}('${literal(payload)}',${radix},${words.length},'${literal(dictionary)}'.split('|'),0,{}))`;
}

export function runPacked(packed: string): string {
  const call = packed.replace(/^eval\(/, '').replace(/\)$/, '');
  return runInNewContext(`(${call})`) as string;
}
