/**
 * Lossless S-expression parser with green/red tree architecture.
 *
 * @module Reader
 */

// Primary parser API
export { parse, parseToSExpr, parseManyToSExpr, type ParseResult } from "./reader/parser.js";

// SExpr types and constructors (re-export for convenience)
export type { SExpr, Loc, Span, Trivia, TriviaKind } from "./reader/types.js";
export {
  List,
  Vector,
  SMap,
  SSet,
  Sym,
  Str,
  Num,
  Bool,
  ErrorNode,
  ParseError,
} from "./reader/types.js";

// Green tree
export type { GreenElement, SyntaxKind, GreenNode, GreenToken } from "./reader/green-tree.js";
export {
  GreenNode as createGreenNode,
  GreenToken as createGreenToken,
  isGreenNode,
  isGreenToken,
} from "./reader/green-tree.js";

// Red tree
export type { RedNode, RedToken, RedElement } from "./reader/red-tree.js";
export {
  createRedTree,
  isRedNode,
  isRedToken,
  nodeAtOffset,
  elementAtOffset,
  elementsInRange,
} from "./reader/red-tree.js";

// Conversion
export { toSExpr, toSExprMany } from "./reader/to-sexpr.js";

// Lexer
export { tokenize, tokenizeWithTrivia, type Token, type TokenWithTrivia } from "./reader/lexer.js";
