/**
 * Parser JSON che ricorda dove sta ogni valore (riga e colonna, da 1). Serve a dare errori di validazione «con riga e campo»:
 * `JSON.parse` non dice dove sta un valore, e i validatori lavorano sul valore già letto. I percorsi hanno la forma
 * `attributes[1].key`; la chiave di una proprietà ha il percorso `<percorso>#key`.
 */

export type Pos = { line: number; column: number };

export type JsonParse =
  { ok: true; value: unknown; at: (path: string) => Pos | undefined } | { ok: false; error: Pos };

export const MAX_JSON_LENGTH = 200_000;
const MAX_DEPTH = 64;

class Syntax extends Error {
  constructor(readonly offset: number) {
    super('syntax');
  }
}

const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;

export function parseJsonWithPositions(text: string): JsonParse {
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') lineStarts.push(i + 1);
  const posOf = (offset: number): Pos => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid]! <= offset) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, column: offset - lineStarts[lo]! + 1 };
  };

  const positions = new Map<string, Pos>();
  let i = 0;

  const skip = () => {
    while (i < text.length && /[ \t\r\n]/.test(text[i]!)) i++;
  };
  const string = (): string => {
    const start = i;
    i++;
    while (i < text.length && text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
    if (i >= text.length) throw new Syntax(start);
    i++;
    try {
      return JSON.parse(text.slice(start, i)) as string;
    } catch {
      throw new Syntax(start);
    }
  };

  function value(path: string, depth: number): unknown {
    if (depth > MAX_DEPTH) throw new Syntax(i);
    skip();
    positions.set(path, posOf(i));
    const c = text[i];
    if (c === '{') {
      // Oggetti senza prototipo: una chiave «__proto__» resta una proprietà come le altre.
      const obj: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
      i++;
      skip();
      if (text[i] === '}') {
        i++;
        return obj;
      }
      for (;;) {
        skip();
        if (text[i] !== '"') throw new Syntax(i);
        const at = i;
        const key = string();
        const child = path === '' ? key : `${path}.${key}`;
        positions.set(`${child}#key`, posOf(at));
        skip();
        if (text[i] !== ':') throw new Syntax(i);
        i++;
        obj[key] = value(child, depth + 1);
        skip();
        if (text[i] === ',') {
          i++;
          continue;
        }
        if (text[i] === '}') {
          i++;
          return obj;
        }
        throw new Syntax(i);
      }
    }
    if (c === '[') {
      const arr: unknown[] = [];
      i++;
      skip();
      if (text[i] === ']') {
        i++;
        return arr;
      }
      for (;;) {
        arr.push(value(`${path}[${arr.length}]`, depth + 1));
        skip();
        if (text[i] === ',') {
          i++;
          continue;
        }
        if (text[i] === ']') {
          i++;
          return arr;
        }
        throw new Syntax(i);
      }
    }
    if (c === '"') return string();
    for (const [word, v] of [
      ['true', true],
      ['false', false],
      ['null', null],
    ] as const) {
      if (text.startsWith(word, i)) {
        i += word.length;
        return v;
      }
    }
    NUMBER.lastIndex = i;
    const m = NUMBER.exec(text);
    if (!m) throw new Syntax(i);
    i += m[0].length;
    return Number(m[0]);
  }

  try {
    if (text.length > MAX_JSON_LENGTH) throw new Syntax(MAX_JSON_LENGTH);
    const result = value('', 0);
    skip();
    if (i < text.length) throw new Syntax(i);
    return { ok: true, value: result, at: (path) => positions.get(path) };
  } catch (e) {
    if (e instanceof Syntax) return { ok: false, error: posOf(Math.min(e.offset, text.length)) };
    throw e;
  }
}
