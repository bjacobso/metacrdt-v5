type t

val of_descriptor : Eval.env -> string -> Eval.value -> t

val validate :
  span:Ast.span ->
  t ->
  Artifact_summary_types.declaration_summary ->
  (unit, Eval.diagnostic list) result
