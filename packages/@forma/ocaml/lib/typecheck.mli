type expression_type = Typed_toplevel.expression_type = {
  form_index : int;
  span : Ast.span;
  typ : Type_expr.ty;
}

val typecheck_program_with_env :
  Type_env.env ->
  Ast.expr list ->
  (string * Type_env.env, Type_diagnostic.t list) result

val typecheck_program_with_env_all :
  Type_env.env ->
  Ast.expr list ->
  (expression_type list * string * Type_env.env, Type_diagnostic.t list) result

val infer_core_expr :
  Type_env.env -> Core_ast.expr -> (Type_expr.ty, Type_diagnostic.t list) result

val typecheck_core_program_typed_with_descriptor_infer :
  Descriptor_protocol.descriptor_hooks ->
  Type_env.env ->
  Core_ast.program ->
  (Typed_core.program * Type_env.env, Type_diagnostic.t list) result
