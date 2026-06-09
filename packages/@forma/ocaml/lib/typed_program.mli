type diagnostic = Type_diagnostic.t
type env = Type_env.env

type callbacks = {
  infer_toplevel_core :
    env -> Core_ast.expr -> (Type_expr.ty * env, diagnostic list) result;
  annotate_expr :
    env -> Core_ast.expr -> (Typed_core.annotation list, diagnostic list) result;
}

val typecheck_with_descriptor_hooks :
  callbacks ->
  Descriptor_protocol.descriptor_hooks ->
  env ->
  Core_ast.program ->
  (Typed_core.program * env, diagnostic list) result
