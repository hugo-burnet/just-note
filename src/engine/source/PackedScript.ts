// Decoder for the "Dean Edwards packer" format that manga sites wrap their
// scripts in:
//
//   eval(function(p,a,c,k,e,d){...}('payload',radix,count,'a|b|c'.split('|'),0,{}))
//
// It only rebuilds the text the script would have produced: nothing from the
// site is ever executed here.
const PACKED =
  /\}\(\s*'((?:[^'\\]|\\[\s\S])*)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'((?:[^'\\]|\\[\s\S])*)'\s*\.split\(\s*'\|'\s*\)/g;

const SIMPLE_ESCAPES: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', '0': '\0' };

export class PackedScript {
  /** Every packed script found in `text`, decoded. Empty when there is none. */
  static decodeAll(text: string): string[] {
    const decoded: string[] = [];
    for (const match of text.matchAll(PACKED)) {
      const code = PackedScript.rebuild(match[1] ?? '', Number(match[2]), Number(match[3]), match[4] ?? '');
      if (code !== null) decoded.push(code);
    }
    return decoded;
  }

  static decode(text: string): string | null {
    return PackedScript.decodeAll(text)[0] ?? null;
  }

  // The arguments are JS string literals: turn them into the values they denote.
  private static unescape(literal: string): string {
    return literal.replace(/\\(?:u([0-9a-fA-F]{4})|x([0-9a-fA-F]{2})|([\s\S]))/g, (_, unicode?: string, hex?: string, char = '') =>
      unicode || hex ? String.fromCharCode(parseInt(unicode || hex || '0', 16)) : (SIMPLE_ESCAPES[char] ?? char),
    );
  }

  private static rebuild(payload: string, radix: number, count: number, dictionary: string): string | null {
    if (!(radix >= 2 && radix <= 62)) return null;

    // Same numbering as the packer: 0-9, a-z, then A-Z for a radix up to 62.
    const encode = (n: number): string => {
      const head = n < radix ? '' : encode(Math.floor(n / radix));
      const digit = n % radix;
      return head + (digit > 35 ? String.fromCharCode(digit + 29) : digit.toString(36));
    };

    const words = PackedScript.unescape(dictionary).split('|');
    const lookup = new Map<string, string>();
    // An empty slot means "the word is its own code".
    for (let i = 0; i < count; i++) lookup.set(encode(i), words[i] || encode(i));
    return PackedScript.unescape(payload).replace(/\b\w+\b/g, (token) => lookup.get(token) ?? token);
  }
}
