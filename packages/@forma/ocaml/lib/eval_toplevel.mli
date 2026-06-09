type value = Value.t

type diagnostic = Eval_common.diagnostic = {
  span : Ast.span option;
  code : string;
  message : string;
}

type context = {
  eval_expr : Env.t -> Reader.expr -> (value, diagnostic list) result;
  parse_params :
    Reader.expr list -> (string list * string option, diagnostic list) result;
}

val eval :
  context -> Env.t -> Reader.expr -> (value * Env.t, diagnostic list) result
