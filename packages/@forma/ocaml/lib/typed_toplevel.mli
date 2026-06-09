type diagnostic = Type_diagnostic.t
type env = Type_env.env

type callbacks = {
  infer_toplevel_core :
    env -> Core_ast.expr -> (Type_expr.ty * env, diagnostic list) result;
  infer_core_expr :
    env -> Core_ast.expr -> (Type_expr.ty, diagnostic list) result;
}

type expression_type = { form_index : int; span : Ast.span; typ : Type_expr.ty }

val typecheck_program_with_env :
  callbacks -> env -> Ast.expr list -> (string * env, diagnostic list) result

val typecheck_program_with_env_all :
  callbacks ->
  env ->
  Ast.expr list ->
  (expression_type list * string * env, diagnostic list) result
