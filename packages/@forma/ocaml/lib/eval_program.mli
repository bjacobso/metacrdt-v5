type value = Value.t
type diagnostic = Eval_common.diagnostic
type env = Env.t

type callbacks = {
  eval_sequence : env -> Ast.expr list -> (value, diagnostic list) result;
  eval_diagnostics_to_expand : diagnostic list -> Expand.diagnostic list;
  eval_toplevel : env -> Ast.expr -> (value * env, diagnostic list) result;
  with_meta_lookup :
    env ->
    (unit -> (value, diagnostic list) result) ->
    (value, diagnostic list) result;
  apply_closure_values :
    Value.closure -> value list -> (value, diagnostic list) result;
}

val expand_diagnostics : Expand.diagnostic list -> diagnostic list

val expand_program :
  callbacks -> Ast.expr list -> (Ast.expr list, diagnostic list) result

val expand_program_with_env :
  callbacks ->
  env ->
  Ast.expr list ->
  (Ast.expr list * env, diagnostic list) result

val evaluate_program :
  callbacks -> Ast.expr list -> (value, diagnostic list) result

val evaluate_program_with_env :
  callbacks -> env -> Ast.expr list -> (value * env, diagnostic list) result

val evaluate_expanded_program_with_env :
  callbacks -> env -> Ast.expr list -> (value * env, diagnostic list) result

val apply_named :
  callbacks -> env -> string -> value -> (value, diagnostic list) result
