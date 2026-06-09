type diagnostic = Type_diagnostic.t
type env = Type_env.env

type callbacks = {
  infer_expr :
    env ->
    Core_ast.expr ->
    (Type_expr.subst * Type_expr.ty, diagnostic list) result;
}

val infer_match :
  callbacks ->
  env ->
  Core_ast.expr ->
  Core_ast.match_arm list ->
  (Type_expr.subst * Type_expr.ty, diagnostic list) result

val pattern_bindings : Core_ast.pattern -> env
