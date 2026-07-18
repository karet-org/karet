// Expression parser for mapping columns.
// Parses human-readable expressions into AstNode trees.
//
// Grammar (simplified):
//   expr     = compare
//   compare  = additive (("==" | "!=" | ">=" | "<=" | ">" | "<") additive)?
//   additive = mult (("+" | "-") mult)*
//   mult     = unary (("*" | "/") unary)*
//   unary    = funcCall | atom
//   funcCall = IDENT "(" args ")" | atom
//   atom     = NUMBER | STRING | "true" | "false" | "null" | IDENT | "(" expr ")"

import type { AstNode, CastType } from "@/lib/types/config";

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

type TokenKind = "num" | "str" | "ident" | "op" | "paren" | "comma" | "eof";
interface Token { kind: TokenKind; value: string; pos: number }

class ParseError extends Error {
  constructor(message: string, public pos: number) {
    super(message);
    this.name = "ParseError";
  }
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    // Skip whitespace
    if (/\s/.test(input[i])) { i++; continue; }

    // Number, supports scientific notation (`1e-5`, `1.5e+10`).
    if (/[0-9]/.test(input[i]) || (input[i] === "-" && i + 1 < input.length && /[0-9]/.test(input[i + 1]) && (tokens.length === 0 || tokens[tokens.length - 1].kind === "op" || tokens[tokens.length - 1].kind === "comma" || (tokens[tokens.length - 1].kind === "paren" && tokens[tokens.length - 1].value === "(")))) {
      const start = i;
      if (input[i] === "-") i++;
      while (i < input.length && /[0-9.]/.test(input[i])) i++;
      // Optional exponent: `e` or `E` followed by an optional sign and digits.
      if (i < input.length && (input[i] === "e" || input[i] === "E")) {
        i++;
        if (i < input.length && (input[i] === "+" || input[i] === "-")) i++;
        while (i < input.length && /[0-9]/.test(input[i])) i++;
      }
      tokens.push({ kind: "num", value: input.slice(start, i), pos: start });
      continue;
    }

    // String literal
    if (input[i] === '"') {
      const start = i; i++;
      while (i < input.length && input[i] !== '"') {
        if (input[i] === "\\") i++;
        i++;
      }
      if (i >= input.length) throw new ParseError("Unterminated string", start);
      i++;
      tokens.push({ kind: "str", value: input.slice(start, i), pos: start });
      continue;
    }

    // Multi-char operators
    if (i + 1 < input.length) {
      const two = input.slice(i, i + 2);
      if (["==", "!=", ">=", "<="].includes(two)) {
        tokens.push({ kind: "op", value: two, pos: i }); i += 2; continue;
      }
    }

    // Single-char operators
    if ("+-*/><".includes(input[i])) {
      tokens.push({ kind: "op", value: input[i], pos: i }); i++; continue;
    }

    // Parens
    if ("()".includes(input[i])) {
      tokens.push({ kind: "paren", value: input[i], pos: i }); i++; continue;
    }

    // Comma
    if (input[i] === ",") {
      tokens.push({ kind: "comma", value: ",", pos: i }); i++; continue;
    }

    // Identifier (includes underscores, dots for lookup paths)
    if (/[a-zA-Z_]/.test(input[i])) {
      const start = i;
      while (i < input.length && /[a-zA-Z0-9_.]/.test(input[i])) i++;
      tokens.push({ kind: "ident", value: input.slice(start, i), pos: start });
      continue;
    }

    throw new ParseError(`Unexpected character '${input[i]}'`, i);
  }
  tokens.push({ kind: "eof", value: "", pos: input.length });
  return tokens;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

class Parser {
  private tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) { this.tokens = tokens; }

  private peek(): Token { return this.tokens[this.pos]; }
  private advance(): Token { return this.tokens[this.pos++]; }

  private expect(kind: TokenKind, value?: string): Token {
    const t = this.peek();
    if (t.kind !== kind || (value !== undefined && t.value !== value)) {
      throw new ParseError(`Expected ${value ?? kind}, got '${t.value}'`, t.pos);
    }
    return this.advance();
  }

  parse(): AstNode {
    const node = this.parseExpr();
    if (this.peek().kind !== "eof") {
      throw new ParseError(`Unexpected '${this.peek().value}'`, this.peek().pos);
    }
    return node;
  }

  private parseExpr(): AstNode { return this.parseCompare(); }

  private parseCompare(): AstNode {
    let left = this.parseAdditive();
    const t = this.peek();
    if (t.kind === "op" && ["==", "!=", ">", "<", ">=", "<="].includes(t.value)) {
      this.advance();
      const right = this.parseAdditive();
      const kindMap: Record<string, AstNode["kind"]> = { "==": "eq", "!=": "ne", ">": "gt", "<": "lt", ">=": "ge", "<=": "le" };
      left = { kind: kindMap[t.value], left, right } as AstNode;
    }
    return left;
  }

  private parseAdditive(): AstNode {
    let left = this.parseMult();
    while (this.peek().kind === "op" && (this.peek().value === "+" || this.peek().value === "-")) {
      const op = this.advance().value;
      const right = this.parseMult();
      left = { kind: op === "+" ? "add" : "sub", left, right } as AstNode;
    }
    return left;
  }

  private parseMult(): AstNode {
    let left = this.parseUnary();
    while (this.peek().kind === "op" && (this.peek().value === "*" || this.peek().value === "/")) {
      const op = this.advance().value;
      const right = this.parseUnary();
      left = { kind: op === "*" ? "mul" : "div", left, right } as AstNode;
    }
    return left;
  }

  private parseUnary(): AstNode {
    const t = this.peek();

    // Function call: ident(...)
    if (t.kind === "ident" && this.tokens[this.pos + 1]?.value === "(") {
      return this.parseFuncCall();
    }

    return this.parseAtom();
  }

  private parseFuncCall(): AstNode {
    const name = this.advance().value; // function name
    this.expect("paren", "(");
    const args = this.parseArgList();
    this.expect("paren", ")");

    switch (name) {
      case "upper": return { kind: "upper", input: this.requireArg(args, 0, name) };
      case "lower": return { kind: "lower", input: this.requireArg(args, 0, name) };
      case "trim": return { kind: "trim", input: this.requireArg(args, 0, name) };
      case "col": {
        // `col("Name With Spaces")`, explicit form for column names
        // that aren't bare identifiers. The bare-ident form (just
        // writing `Description`) still works for normal names; this
        // arm handles round-trip from `astExpression` for source
        // schemas with whitespace, dashes, etc.
        const arg = this.requireArg(args, 0, name);
        if (arg.kind !== "str") {
          throw new ParseError("col() requires a string column name", this.peek().pos);
        }
        return { kind: "col", name: arg.value };
      }
      case "contains": return { kind: "contains", input: this.requireArg(args, 0, name), pattern: this.requireArg(args, 1, name) };
      case "concat": {
        // Shape: `concat("sep", a, b, ...)`, separator first, zero or
        // more args after. The AST permits an empty `args` array (Polars
        // produces an empty string for that case), so we don't require
        // a minimum body arity here, only the separator itself.
        if (args.length < 1) throw new ParseError("concat requires a string separator", this.peek().pos);
        const sep = args[0];
        if (sep.kind !== "str") throw new ParseError("concat first arg must be a string separator", this.peek().pos);
        return { kind: "concat", sep: sep.value, args: args.slice(1) };
      }
      case "coalesce": {
        // `coalesce(a, b, c, ...)`, arity is open. Empty `coalesce()`
        // is a constant null; we still allow it for symmetry with the
        // worker-side semantics.
        return { kind: "coalesce", args };
      }
      case "substring": {
        const input = this.requireArg(args, 0, name);
        const start = args[1];
        if (!start || start.kind !== "num") throw new ParseError("substring requires numeric start", this.peek().pos);
        const length = args[2];
        return { kind: "substring", input, start: start.value, length: length && length.kind === "num" ? length.value : null };
      }
      case "parse_date": {
        const input = this.requireArg(args, 0, name);
        const fmt = args[1];
        if (!fmt || fmt.kind !== "str") throw new ParseError("parse_date requires a format string", this.peek().pos);
        return { kind: "parse_date", input, format: fmt.value };
      }
      case "lookup_ref": {
        if (args.length < 2) throw new ParseError("lookup_ref requires (lookup_id, input)", this.peek().pos);
        const idArg = args[0];
        // lookup_id can be a bare identifier or string
        const lookupId = idArg.kind === "str" ? idArg.value : idArg.kind === "col" ? idArg.name : String((idArg as { value?: unknown }).value ?? "");
        return { kind: "lookup_ref", lookup_id: lookupId, input: args[1] };
      }
      case "cast": {
        const input = this.requireArg(args, 0, name);
        const toArg = args[1];
        const toStr = toArg?.kind === "str" ? toArg.value : toArg?.kind === "col" ? toArg.name : "";
        if (!["int64", "float64", "string", "date"].includes(toStr)) {
          throw new ParseError(`cast type must be int64, float64, string, or date`, this.peek().pos);
        }
        return { kind: "cast", input, to: toStr as CastType };
      }
      case "if": {
        if (args.length < 3) throw new ParseError("if requires (cond, then, else)", this.peek().pos);
        return { kind: "if", cond: args[0], then: args[1], else: args[2] };
      }
      // Binary ops as function calls: add(a, b), mul(a, b), eq(a, b), etc.
      case "add": case "sub": case "mul": case "div":
      case "eq": case "ne": case "gt": case "lt": case "ge": case "le":
        return { kind: name, left: this.requireArg(args, 0, name), right: this.requireArg(args, 1, name) } as AstNode;
      default:
        throw new ParseError(`Unknown function '${name}'`, this.peek().pos);
    }
  }

  private parseArgList(): AstNode[] {
    const args: AstNode[] = [];
    if (this.peek().value === ")") return args;
    args.push(this.parseExpr());
    while (this.peek().kind === "comma") {
      this.advance();
      args.push(this.parseExpr());
    }
    return args;
  }

  private requireArg(args: AstNode[], index: number, fn: string): AstNode {
    if (index >= args.length) throw new ParseError(`${fn} requires at least ${index + 1} argument(s)`, this.peek().pos);
    return args[index];
  }

  private parseAtom(): AstNode {
    const t = this.peek();

    if (t.kind === "num") {
      this.advance();
      return { kind: "num", value: Number(t.value) };
    }

    if (t.kind === "str") {
      this.advance();
      // Strip quotes and unescape
      const inner = t.value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
      return { kind: "str", value: inner };
    }

    if (t.kind === "ident") {
      this.advance();
      if (t.value === "true") return { kind: "bool", value: true };
      if (t.value === "false") return { kind: "bool", value: false };
      if (t.value === "null") return { kind: "null" };
      // Bare identifier = column reference
      return { kind: "col", name: t.value };
    }

    if (t.kind === "paren" && t.value === "(") {
      this.advance();
      const expr = this.parseExpr();
      this.expect("paren", ")");
      return expr;
    }

    throw new ParseError(`Unexpected '${t.value}'`, t.pos);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type ParseResult =
  | { ok: true; value: AstNode }
  | { ok: false; error: string; pos: number };

/** Parse an expression string into an AstNode. */
export function parseExpression(input: string): ParseResult {
  try {
    const tokens = tokenize(input.trim());
    const parser = new Parser(tokens);
    return { ok: true, value: parser.parse() };
  } catch (e) {
    if (e instanceof ParseError) {
      return { ok: false, error: e.message, pos: e.pos };
    }
    return { ok: false, error: String(e), pos: 0 };
  }
}
