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

val of_cst : Cst.expr list -> (expr list, diagnostic list) result
val expr_span : expr -> span
val expr_to_json : expr -> string
