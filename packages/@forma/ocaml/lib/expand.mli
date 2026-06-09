type diagnostic = { span : Ast.span option; code : string; message : string }
type eval_body = Env.t -> Ast.expr list -> (Value.t, diagnostic list) result

val expand_program :
  eval_body:eval_body ->
  Env.t ->
  Ast.expr list ->
  (Ast.expr list * Env.t, diagnostic list) result

val diagnostic_to_json : diagnostic -> string
