type span = Cst.span = {
  source_id : string;
  start_offset : int;
  end_offset : int;
}

type expr = Cst.expr =
  | Nil of span
  | Bool of span * bool
  | Int of span * int
  | Float of span * float
  | String of span * string
  | Symbol of span * string
  | Keyword of span * string
  | List of span * expr list
  | Vector of span * expr list
  | Map of span * (expr * expr) list

type diagnostic = Cst.diagnostic = {
  span : span option;
  code : string;
  message : string;
}

val parse_cst :
  source_id:string -> string -> (Cst.expr list, diagnostic list) result

val parse : source_id:string -> string -> (expr list, diagnostic list) result

val parse_ast :
  source_id:string -> string -> (Ast.expr list, Ast.diagnostic list) result

val expr_to_json : expr -> string
val diagnostic_to_json : diagnostic -> string
