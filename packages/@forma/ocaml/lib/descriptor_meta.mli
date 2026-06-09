val core_expr_value : Core_ast.expr -> Value.t
val type_expr_of_value : Value.t -> Type_expr.ty option

val apply_hook :
  Env.t ->
  string ->
  string ->
  Descriptor_protocol.descriptor_application ->
  (Value.t, Eval.diagnostic list) result
