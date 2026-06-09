type diagnostic = { path : string; code : string; message : string }

val json_of_value :
  path:string -> Eval.value -> (Ir_json.t, diagnostic list) result

val value_to_json : Eval.value -> string
val declarations_to_json : Eval.value list -> string
val declaration_count : Eval.value list -> int
val validate_declarations : Eval.value list -> diagnostic list
val diagnostic_to_json : span:Ast.span -> diagnostic -> string
