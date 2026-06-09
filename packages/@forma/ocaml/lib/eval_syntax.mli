type value = Value.t

type diagnostic = Eval_common.diagnostic = {
  span : Ast.span option;
  code : string;
  message : string;
}

type context = {
  eval_expr : Env.t -> Reader.expr -> (value, diagnostic list) result;
}

val eval :
  context ->
  Env.t ->
  string ->
  Reader.expr list ->
  (value option, diagnostic list) result
