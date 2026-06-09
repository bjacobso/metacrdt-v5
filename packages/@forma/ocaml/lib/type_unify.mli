val unify :
  Type_expr.ty ->
  Type_expr.ty ->
  (Type_expr.subst, Type_diagnostic.t list) result

val unify_with_span :
  Ast.span ->
  Type_expr.ty ->
  Type_expr.ty ->
  (Type_expr.subst, Type_diagnostic.t list) result

val unify_many :
  Type_expr.ty list ->
  Type_expr.ty list ->
  (Type_expr.subst, Type_diagnostic.t list) result
