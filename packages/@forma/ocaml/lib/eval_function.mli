type value = Value.t
type closure = Value.closure
type diagnostic = Eval_common.diagnostic
type env = Env.t

type callbacks = {
  eval_expr : env -> Ast.expr -> (value, diagnostic list) result;
  eval_all : env -> Ast.expr list -> (value list, diagnostic list) result;
  eval_sequence : env -> Ast.expr list -> (value, diagnostic list) result;
  with_meta_lookup :
    env ->
    (unit -> (value, diagnostic list) result) ->
    (value, diagnostic list) result;
}

val bind_let :
  callbacks -> env -> Ast.expr list -> (env, diagnostic list) result

val eval_let :
  callbacks -> env -> Ast.expr list -> (value, diagnostic list) result

val parse_params :
  Ast.expr list -> (string list * string option, diagnostic list) result

val eval_lambda : env -> Ast.expr list -> (value, diagnostic list) result

val apply_closure :
  callbacks ->
  env ->
  closure ->
  Ast.expr list ->
  (value, diagnostic list) result

val apply_closure_values :
  callbacks -> closure -> value list -> (value, diagnostic list) result

val eval_application :
  callbacks ->
  env ->
  Ast.expr ->
  Ast.expr list ->
  (value, diagnostic list) result
