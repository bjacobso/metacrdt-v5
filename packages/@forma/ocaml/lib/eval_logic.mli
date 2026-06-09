type value = Value.t

type diagnostic = Eval_common.diagnostic = {
  span : Ast.span option;
  code : string;
  message : string;
}

type context = {
  eval_expr : Env.t -> Reader.expr -> (value, diagnostic list) result;
}

val eval_and :
  context -> Env.t -> Reader.expr list -> (value, diagnostic list) result

val eval_or :
  context -> Env.t -> Reader.expr list -> (value, diagnostic list) result

val eval_not :
  context -> Env.t -> Reader.expr list -> (value, diagnostic list) result
