type value = Value.t

type diagnostic = Eval_common.diagnostic = {
  span : Ast.span option;
  code : string;
  message : string;
}

type context = {
  eval_expr : Env.t -> Reader.expr -> (value, diagnostic list) result;
}

val schema_decl :
  context -> Env.t -> Reader.expr list -> (value, diagnostic list) result

val error_decl :
  context -> Env.t -> Reader.expr list -> (value, diagnostic list) result

val api_group_decl :
  context -> Env.t -> Reader.expr list -> (value, diagnostic list) result
