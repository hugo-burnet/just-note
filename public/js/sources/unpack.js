// Decoder for the "Dean Edwards packer" format that manga sites wrap their
// scripts in:
//
//   eval(function(p,a,c,k,e,d){...}('payload',radix,count,'a|b|c'.split('|'),0,{}))
//
// It only rebuilds the text the script would have produced: nothing from the
// site is ever executed here.

const PACKED =
  /\}\(\s*'((?:[^'\\]|\\[\s\S])*)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'((?:[^'\\]|\\[\s\S])*)'\s*\.split\(\s*'\|'\s*\)/g;

const SIMPLE_ESCAPES = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', 0: '\0' };

// The arguments are JS string literals: turn them into the values they denote.
function unescapeLiteral(literal) {
  return literal.replace(/\\(?:u([0-9a-fA-F]{4})|x([0-9a-fA-F]{2})|([\s\S]))/g, (_, u, x, char) =>
    u || x ? String.fromCharCode(parseInt(u || x, 16)) : (SIMPLE_ESCAPES[char] ?? char),
  );
}

function decode([, payload, radix, count, dictionary]) {
  radix = Number(radix);
  count = Number(count);
  if (!(radix >= 2 && radix <= 62)) return null;

  // Same numbering as the packer: 0-9, a-z, then A-Z for radix up to 62.
  const encode = (n) => {
    const head = n < radix ? '' : encode(Math.floor(n / radix));
    const digit = n % radix;
    return head + (digit > 35 ? String.fromCharCode(digit + 29) : digit.toString(36));
  };

  const words = unescapeLiteral(dictionary).split('|');
  const lookup = new Map();
  // An empty slot means "the word is its own code".
  for (let i = 0; i < count; i++) lookup.set(encode(i), words[i] || encode(i));
  return unescapeLiteral(payload).replace(/\b\w+\b/g, (token) => lookup.get(token) ?? token);
}

// Every packed script found in `text`, decoded. Empty when there is none.
export function unpackAll(text) {
  return [...text.matchAll(PACKED)].map(decode).filter((code) => code !== null);
}

export const unpack = (text) => unpackAll(text)[0] ?? null;
