/**
 * Interprete di formule per lo schema di statistiche (#33). Non usa `eval` né `Function`: la formula è un'espressione
 * aritmetica che diventa un albero (parser a precedenze) e si valuta con un budget di passi e di tempo. Le variabili sono solo
 * quelle dello scope passato (una `Map`, mai un oggetto: nessun accesso al prototipo), le funzioni sono un elenco chiuso.
 * Booleani = 1 e 0. Nessun accesso a rete, file o globali.
 */

export type FormulaErrorCode =
  | 'empty'
  | 'too_long'
  | 'too_complex'
  | 'unexpected_char'
  | 'unexpected_token'
  | 'unexpected_end'
  | 'invalid_number'
  | 'unknown_function'
  | 'wrong_arity'
  | 'unknown_variable'
  | 'division_by_zero'
  | 'domain'
  | 'not_finite'
  | 'budget_exceeded';

export type FormulaError = {
  code: FormulaErrorCode;
  /** Posizione (0-based) nel testo della formula. */
  index: number;
  /** Nome della funzione o della variabile coinvolta, quando c'è. */
  name?: string;
};

export const FORMULA_LIMITS = {
  maxLength: 500,
  maxNodes: 120,
  maxDepth: 32,
  maxSteps: 2000,
  maxMillis: 20,
  maxPowExponent: 1024,
} as const;

export type Limits = {
  maxSteps?: number;
  maxMillis?: number;
};

type Node =
  | { t: 'num'; v: number }
  | { t: 'ref'; name: string; index: number }
  | { t: 'un'; op: '-' | '!'; arg: Node }
  | { t: 'bin'; op: string; l: Node; r: Node; index: number }
  | { t: 'call'; name: string; args: Node[]; index: number };

/** Funzioni ammesse: [minimo, massimo] di argomenti. */
const FUNCTIONS: ReadonlyMap<string, readonly [number, number]> = new Map([
  ['floor', [1, 1]],
  ['ceil', [1, 1]],
  ['round', [1, 1]],
  ['trunc', [1, 1]],
  ['abs', [1, 1]],
  ['sign', [1, 1]],
  ['sqrt', [1, 1]],
  ['pow', [2, 2]],
  ['min', [1, 16]],
  ['max', [1, 16]],
  ['clamp', [3, 3]],
  ['if', [3, 3]],
]);

/** Nomi di funzione: non utilizzabili come chiavi dello schema. */
export const FUNCTION_NAMES: readonly string[] = [...FUNCTIONS.keys()];

type Token =
  | { type: 'num'; value: number; index: number }
  | { type: 'id'; value: string; index: number }
  | { type: 'op' | 'lp' | 'rp' | 'comma' | 'eof'; value: string; index: number };

class Fail extends Error {
  constructor(readonly detail: FormulaError) {
    super(detail.code);
  }
}
const fail = (code: FormulaErrorCode, index: number, name?: string): never => {
  throw new Fail(name === undefined ? { code, index } : { code, index, name });
};

const OPS = ['<=', '>=', '==', '!=', '&&', '||', '+', '-', '*', '/', '%', '<', '>', '!'];

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (/\s/.test(c)) {
      i++;
    } else if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j]!)) j++;
      const text = src.slice(i, j);
      if (!/^(\d+\.?\d*|\.\d+)$/.test(text)) fail('invalid_number', i);
      tokens.push({ type: 'num', value: Number(text), index: i });
      i = j;
    } else if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j]!)) j++;
      tokens.push({ type: 'id', value: src.slice(i, j), index: i });
      i = j;
    } else if (c === '(') {
      tokens.push({ type: 'lp', value: c, index: i++ });
    } else if (c === ')') {
      tokens.push({ type: 'rp', value: c, index: i++ });
    } else if (c === ',') {
      tokens.push({ type: 'comma', value: c, index: i++ });
    } else {
      const op = OPS.find((o) => src.startsWith(o, i));
      if (!op) return fail('unexpected_char', i);
      tokens.push({ type: 'op', value: op, index: i });
      i += op.length;
    }
  }
  tokens.push({ type: 'eof', value: '', index: src.length });
  return tokens;
}

/** Precedenza degli operatori binari (più alto = lega di più). */
const PRECEDENCE: Record<string, number> = {
  '||': 1,
  '&&': 2,
  '==': 3,
  '!=': 3,
  '<': 4,
  '<=': 4,
  '>': 4,
  '>=': 4,
  '+': 5,
  '-': 5,
  '*': 6,
  '/': 6,
  '%': 6,
};
const UNARY_PRECEDENCE = 7;

function parseTokens(tokens: Token[]): { ast: Node; refs: string[] } {
  let pos = 0;
  let nodes = 0;
  const refs: string[] = [];
  const peek = () => tokens[pos]!;
  const next = () => tokens[pos++]!;
  const count = () => {
    if (++nodes > FORMULA_LIMITS.maxNodes) fail('too_complex', peek().index);
  };
  const unexpected = (t: Token): never =>
    fail(t.type === 'eof' ? 'unexpected_end' : 'unexpected_token', t.index);

  function expression(minPrec: number, depth: number): Node {
    if (depth > FORMULA_LIMITS.maxDepth) fail('too_complex', peek().index);
    let left = prefix(depth);
    for (;;) {
      const t = peek();
      if (t.type !== 'op') break;
      const prec = PRECEDENCE[t.value];
      if (prec === undefined || prec < minPrec) break;
      next();
      const right = expression(prec + 1, depth + 1);
      count();
      left = { t: 'bin', op: t.value, l: left, r: right, index: t.index };
    }
    return left;
  }

  function prefix(depth: number): Node {
    const t = next();
    count();
    if (t.type === 'num') return { t: 'num', v: t.value };
    if (t.type === 'op' && (t.value === '-' || t.value === '!')) {
      if (depth + 1 > FORMULA_LIMITS.maxDepth) fail('too_complex', t.index);
      return { t: 'un', op: t.value, arg: expression(UNARY_PRECEDENCE, depth + 1) };
    }
    if (t.type === 'lp') {
      const inner = expression(1, depth + 1);
      const close = next();
      if (close.type !== 'rp') unexpected(close);
      return inner;
    }
    if (t.type === 'id') {
      if (peek().type !== 'lp') {
        if (!refs.includes(t.value)) refs.push(t.value);
        return { t: 'ref', name: t.value, index: t.index };
      }
      const arity = FUNCTIONS.get(t.value);
      if (!arity) return fail('unknown_function', t.index, t.value);
      next();
      const args: Node[] = [];
      if (peek().type !== 'rp') {
        for (;;) {
          args.push(expression(1, depth + 1));
          const sep = next();
          if (sep.type === 'rp') break;
          if (sep.type !== 'comma') unexpected(sep);
        }
      } else {
        next();
      }
      if (args.length < arity[0] || args.length > arity[1]) {
        fail('wrong_arity', t.index, t.value);
      }
      return { t: 'call', name: t.value, args, index: t.index };
    }
    return unexpected(t);
  }

  const ast = expression(1, 0);
  const rest = peek();
  if (rest.type !== 'eof') unexpected(rest);
  return { ast, refs };
}

export type Parsed = { ok: true; ast: Node; refs: string[] } | { ok: false; error: FormulaError };

/** Controlla la sintassi e restituisce l'albero e le variabili usate (nell'ordine in cui compaiono). */
export function parseFormula(src: string): Parsed {
  try {
    if (src.trim() === '') return fail('empty', 0);
    if (src.length > FORMULA_LIMITS.maxLength) return fail('too_long', FORMULA_LIMITS.maxLength);
    const { ast, refs } = parseTokens(tokenize(src));
    return { ok: true, ast, refs };
  } catch (e) {
    if (e instanceof Fail) return { ok: false, error: e.detail };
    throw e;
  }
}

export type Scope = ReadonlyMap<string, number> | Readonly<Record<string, number>>;
export type Evaluated = { ok: true; value: number } | { ok: false; error: FormulaError };

function lookup(scope: Scope, name: string): number | undefined {
  if (scope instanceof Map) return scope.get(name);
  return Object.hasOwn(scope, name) ? (scope as Record<string, number>)[name] : undefined;
}

/** Valuta un albero già validato. Ogni nodo costa un passo; il tempo si controlla ogni 64 passi. */
export function evaluate(ast: Node, scope: Scope, limits: Limits = {}): Evaluated {
  const maxSteps = limits.maxSteps ?? FORMULA_LIMITS.maxSteps;
  const deadline = performance.now() + (limits.maxMillis ?? FORMULA_LIMITS.maxMillis);
  let steps = 0;

  const finite = (n: number, index: number) => (Number.isFinite(n) ? n : fail('not_finite', index));

  function run(node: Node): number {
    if (++steps > maxSteps || (steps % 64 === 0 && performance.now() > deadline)) {
      fail('budget_exceeded', 'index' in node ? node.index : 0);
    }
    switch (node.t) {
      case 'num':
        return node.v;
      case 'ref': {
        const v = lookup(scope, node.name);
        return v === undefined ? fail('unknown_variable', node.index, node.name) : v;
      }
      case 'un': {
        const v = run(node.arg);
        return node.op === '-' ? -v : v === 0 ? 1 : 0;
      }
      case 'bin': {
        if (node.op === '&&') return run(node.l) !== 0 && run(node.r) !== 0 ? 1 : 0;
        if (node.op === '||') return run(node.l) !== 0 || run(node.r) !== 0 ? 1 : 0;
        const a = run(node.l);
        const b = run(node.r);
        switch (node.op) {
          case '+':
            return finite(a + b, node.index);
          case '-':
            return finite(a - b, node.index);
          case '*':
            return finite(a * b, node.index);
          case '/':
            return b === 0 ? fail('division_by_zero', node.index) : finite(a / b, node.index);
          case '%':
            return b === 0 ? fail('division_by_zero', node.index) : finite(a % b, node.index);
          case '<':
            return a < b ? 1 : 0;
          case '<=':
            return a <= b ? 1 : 0;
          case '>':
            return a > b ? 1 : 0;
          case '>=':
            return a >= b ? 1 : 0;
          case '==':
            return a === b ? 1 : 0;
          default:
            return a !== b ? 1 : 0;
        }
      }
      case 'call':
        return call(node);
    }
  }

  function call(node: Extract<Node, { t: 'call' }>): number {
    if (node.name === 'if')
      return run(node.args[0]!) !== 0 ? run(node.args[1]!) : run(node.args[2]!);
    const a = node.args.map(run);
    const x = a[0]!;
    switch (node.name) {
      case 'floor':
        return Math.floor(x);
      case 'ceil':
        return Math.ceil(x);
      case 'round':
        return Math.round(x);
      case 'trunc':
        return Math.trunc(x);
      case 'abs':
        return Math.abs(x);
      case 'sign':
        return Math.sign(x);
      case 'sqrt':
        return x < 0 ? fail('domain', node.index, 'sqrt') : Math.sqrt(x);
      case 'pow':
        if (Math.abs(a[1]!) > FORMULA_LIMITS.maxPowExponent) fail('domain', node.index, 'pow');
        return finite(Math.pow(x, a[1]!), node.index);
      case 'min':
        return Math.min(...a);
      case 'max':
        return Math.max(...a);
      default:
        // clamp: gli estremi invertiti non sono un errore, si ordinano.
        return Math.min(Math.max(x, Math.min(a[1]!, a[2]!)), Math.max(a[1]!, a[2]!));
    }
  }

  try {
    return { ok: true, value: run(ast) };
  } catch (e) {
    if (e instanceof Fail) return { ok: false, error: e.detail };
    throw e;
  }
}

/** Sintassi + valutazione in un colpo solo. */
export function evalFormula(src: string, scope: Scope, limits: Limits = {}): Evaluated {
  const parsed = parseFormula(src);
  return parsed.ok ? evaluate(parsed.ast, scope, limits) : parsed;
}
