type value = Value.t
type diagnostic = Eval_common.diagnostic
type env = Env.t

type callbacks = {
  eval_expr : env -> Ast.expr -> (value, diagnostic list) result;
  eval_expr_to_quote : env -> Ast.expr -> (value, Quote.diagnostic list) result;
}

val eval_quote : Ast.expr list -> (value, diagnostic list) result

val eval_quasiquote :
  callbacks -> env -> Ast.expr list -> (value, diagnostic list) result

val eval_sequence :
  callbacks -> env -> Ast.expr list -> (value, diagnostic list) result

val eval_if :
  callbacks -> env -> Ast.expr list -> (value, diagnostic list) result

val eval_when :
  callbacks -> env -> Ast.expr list -> (value, diagnostic list) result

val eval_cond :
  callbacks -> env -> Ast.expr list -> (value, diagnostic list) result

val eval_match :
  callbacks -> env -> Ast.expr list -> (value, diagnostic list) result
