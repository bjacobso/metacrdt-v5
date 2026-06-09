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

let of_cst exprs = Ok exprs
let expr_span = Cst.expr_span
let expr_to_json = Cst.expr_to_json
