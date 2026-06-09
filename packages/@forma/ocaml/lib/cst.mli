type span = { source_id : string; start_offset : int; end_offset : int }

type expr =
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

type diagnostic = { span : span option; code : string; message : string }

val span : string -> int -> int -> span
val expr_span : expr -> span
val span_to_json : span -> string
val expr_to_json : expr -> string
val diagnostic_to_json : diagnostic -> string
