// The Search page's query language, parsed into a tree and compiled to a
// DuckDB condition with bound values.
//
//   error                     rows containing "error" in any field
//   "not found"               a phrase
//   status=404 host=git*      field match, * is a wildcard
//   status>=500               comparison
//   NOT method=GET            negation
//   (a OR b) c                OR, AND (also implied by a space), parentheses
//
// Words match without regard to case. AND, OR and NOT are keywords only when
// written in capitals.

export type Op = "=" | "!=" | ">" | ">=" | "<" | "<=";

export type SearchNode =
  | { kind: "and"; items: SearchNode[] }
  | { kind: "or"; items: SearchNode[] }
  | { kind: "not"; item: SearchNode }
  | { kind: "text"; value: string }
  | { kind: "field"; field: string; op: Op; value: string };

export class SearchSyntaxError extends Error {
  constructor(
    message: string,
    /** Character offset in the search, when the error has one. */
    readonly position: number | null = null,
  ) {
    super(message);
  }
}

type Token =
  | { kind: "lparen" | "rparen" | "and" | "or" | "not"; pos: number }
  | { kind: "term"; pos: number; field?: string; op?: Op; value: string };

const FIELD_TERM = /^([A-Za-z_@][\w.@-]*)(!=|>=|<=|=|>|<)/;

function readQuoted(input: string, start: number): { value: string; end: number } {
  let value = "";
  let i = start + 1;
  while (i < input.length) {
    const ch = input[i];
    if (ch === "\\" && i + 1 < input.length) {
      value += input[i + 1];
      i += 2;
      continue;
    }
    if (ch === '"') return { value, end: i + 1 };
    value += ch;
    i++;
  }
  throw new SearchSyntaxError("A quote is not closed.", start);
}

function isBreak(ch: string): boolean {
  return /\s/.test(ch) || ch === "(" || ch === ")" || ch === '"';
}

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) {
      i++;
    } else if (ch === "(" || ch === ")") {
      tokens.push({ kind: ch === "(" ? "lparen" : "rparen", pos: i });
      i++;
    } else if (ch === '"') {
      const q = readQuoted(input, i);
      tokens.push({ kind: "term", pos: i, value: q.value });
      i = q.end;
    } else {
      const start = i;
      while (i < input.length && !isBreak(input[i])) i++;
      const word = input.slice(start, i);
      const m = FIELD_TERM.exec(word);
      if (m) {
        let value = word.slice(m[0].length);
        // field="quoted value"
        if (value === "" && input[i] === '"') {
          const q = readQuoted(input, i);
          value = q.value;
          i = q.end;
        } else if (value === "") {
          throw new SearchSyntaxError(`${m[1]}${m[2]} needs a value.`, start);
        }
        tokens.push({ kind: "term", pos: start, field: m[1], op: m[2] as Op, value });
      } else if (word === "AND" || word === "OR" || word === "NOT") {
        tokens.push({ kind: word.toLowerCase() as "and" | "or" | "not", pos: start });
      } else {
        tokens.push({ kind: "term", pos: start, value: word });
      }
    }
  }
  return tokens;
}

/** Parse a search. An empty search gives null, which matches every row. */
export function parseSearch(input: string): SearchNode | null {
  const tokens = tokenize(input);
  let i = 0;
  const peek = () => tokens[i];

  const parseOr = (): SearchNode => {
    const items = [parseAnd()];
    while (peek()?.kind === "or") {
      i++;
      items.push(parseAnd());
    }
    return items.length === 1 ? items[0] : { kind: "or", items };
  };

  const parseAnd = (): SearchNode => {
    const items = [parseUnary()];
    for (;;) {
      const t = peek();
      if (!t || t.kind === "or" || t.kind === "rparen") break;
      if (t.kind === "and") i++;
      items.push(parseUnary());
    }
    return items.length === 1 ? items[0] : { kind: "and", items };
  };

  const parseUnary = (): SearchNode => {
    const t = peek();
    if (!t) {
      const pos = input.length;
      throw new SearchSyntaxError("The search ends where a term was expected.", pos);
    }
    i++;
    switch (t.kind) {
      case "not":
        return { kind: "not", item: parseUnary() };
      case "lparen": {
        const inner = parseOr();
        if (peek()?.kind !== "rparen") throw new SearchSyntaxError("A bracket is not closed.", t.pos);
        i++;
        return inner;
      }
      case "term":
        return t.field
          ? { kind: "field", field: t.field, op: t.op!, value: t.value }
          : { kind: "text", value: t.value };
      default:
        throw new SearchSyntaxError(`Unexpected ${t.kind === "rparen" ? ")" : t.kind.toUpperCase()}.`, t.pos);
    }
  };

  if (tokens.length === 0) return null;
  const tree = parseOr();
  if (i < tokens.length) {
    const t = tokens[i];
    throw new SearchSyntaxError(`Unexpected ${t.kind === "rparen" ? ")" : "term"}.`, t.pos);
  }
  return tree;
}

export interface SearchColumn {
  name: string;
  /** DuckDB type, as DESCRIBE gives it. */
  type: string;
}

export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export function isNumericType(type: string): boolean {
  return /^(TINYINT|SMALLINT|INTEGER|BIGINT|HUGEINT|UTINYINT|USMALLINT|UINTEGER|UBIGINT|UHUGEINT|FLOAT|DOUBLE|REAL|DECIMAL)/i.test(type);
}

function isTimeType(type: string): boolean {
  return /^(DATE|TIMESTAMP)/i.test(type);
}

/** A LIKE pattern with `*` as the wildcard and `%`, `_`, `\` taken literally. */
export function likePattern(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`).replace(/\*/g, "%");
}

export interface CompiledSearch {
  /** A boolean SQL expression. Free text is matched against `textColumn`, which must be lower case. */
  sql: string;
  values: string[];
  /** The search has a free-text term, so it needs `textColumn`. */
  usesText: boolean;
}

/**
 * Compile a search to a condition over `columns`. Field names are matched
 * without regard to case and checked against `columns`; every value is bound.
 * Each match is wrapped in COALESCE so NOT also keeps rows where the field is
 * empty.
 */
export function compileSearch(
  tree: SearchNode | null,
  columns: SearchColumn[],
  textColumn: string,
): CompiledSearch {
  const values: string[] = [];
  let usesText = false;
  const bind = (v: string) => {
    values.push(v);
    return "?";
  };

  const findColumn = (field: string): SearchColumn => {
    const exact = columns.find((c) => c.name === field);
    const col = exact ?? columns.find((c) => c.name.toLowerCase() === field.toLowerCase());
    if (!col) throw new SearchSyntaxError(`No field named "${field}".`);
    return col;
  };

  const leaf = (sql: string) => `COALESCE(${sql}, false)`;

  const field = (node: Extract<SearchNode, { kind: "field" }>): string => {
    const col = findColumn(node.field);
    const id = quoteIdent(col.name);
    const { op, value } = node;

    if (value === "*" && (op === "=" || op === "!=")) {
      return op === "=" ? `${id} IS NOT NULL` : `${id} IS NULL`;
    }
    const wildcard = value.includes("*");
    if (wildcard) {
      if (op !== "=" && op !== "!=") {
        throw new SearchSyntaxError(`${node.field}${op} cannot take a wildcard.`);
      }
      const like = `CAST(${id} AS VARCHAR) ILIKE ${bind(likePattern(value))} ESCAPE '\\'`;
      return leaf(op === "=" ? like : `NOT (${like})`);
    }

    const sqlOp = op === "!=" ? "<>" : op;
    if (isNumericType(col.type)) {
      if (!Number.isFinite(Number(value)) || value.trim() === "") {
        throw new SearchSyntaxError(`${col.name} holds numbers, so "${value}" cannot match it.`);
      }
      return leaf(`${id} ${sqlOp} CAST(${bind(value)} AS DOUBLE)`);
    }
    if (isTimeType(col.type)) {
      return leaf(`${id} ${sqlOp} TRY_CAST(${bind(value)} AS ${/^DATE$/i.test(col.type) ? "DATE" : "TIMESTAMP"})`);
    }
    if (/^BOOLEAN/i.test(col.type)) {
      return leaf(`${id} ${sqlOp} TRY_CAST(${bind(value)} AS BOOLEAN)`);
    }
    if (op === "=" || op === "!=") {
      return leaf(`lower(CAST(${id} AS VARCHAR)) ${sqlOp} lower(${bind(value)})`);
    }
    return leaf(`CAST(${id} AS VARCHAR) ${sqlOp} ${bind(value)}`);
  };

  const walk = (node: SearchNode): string => {
    switch (node.kind) {
      case "and":
        return `(${node.items.map(walk).join(" AND ")})`;
      case "or":
        return `(${node.items.map(walk).join(" OR ")})`;
      case "not":
        return `(NOT ${walk(node.item)})`;
      case "text": {
        // textColumn is already lower case. contains() is about three times
        // faster than ILIKE, so it is used when there is no wildcard.
        usesText = true;
        const v = node.value.toLowerCase();
        return v.includes("*")
          ? leaf(`${textColumn} LIKE ${bind(`%${likePattern(v)}%`)} ESCAPE '\\'`)
          : leaf(`contains(${textColumn}, ${bind(v)})`);
      }
      case "field":
        return field(node);
    }
  };

  const sql = tree ? walk(tree) : "true";
  return { sql, values, usesText };
}

/** A search value written so the parser reads it back unchanged. */
export function formatValue(value: string): string {
  return /^[^\s()"]+$/.test(value) && !/^(AND|OR|NOT)$/.test(value)
    ? value
    : `"${value.replace(/[\\"]/g, (c) => `\\${c}`)}"`;
}

/** Add `field=value`, or `NOT field=value`, to the end of a search. */
export function addFieldTerm(search: string, field: string, value: string, exclude = false): string {
  const term = `${exclude ? "NOT " : ""}${field}=${formatValue(value)}`;
  const base = search.trim();
  if (!base) return term;
  // A search with a top-level OR has to be bracketed, or the new term would
  // join only its last branch.
  let tree: SearchNode | null = null;
  try {
    tree = parseSearch(base);
  } catch {
    // Leave a broken search as it is; the user sees its error when it runs.
  }
  return tree?.kind === "or" ? `(${base}) ${term}` : `${base} ${term}`;
}

/**
 * The free-text words a search looks for, to highlight in the results. Words
 * under NOT are left out, and a wildcard word gives its longest literal part.
 */
export function highlightTerms(tree: SearchNode | null): string[] {
  const out: string[] = [];
  const walk = (node: SearchNode) => {
    if (node.kind === "and" || node.kind === "or") node.items.forEach(walk);
    else if (node.kind === "text") {
      const part = node.value.split("*").sort((a, b) => b.length - a.length)[0];
      if (part) out.push(part);
    }
  };
  if (tree) walk(tree);
  return [...new Set(out)];
}
