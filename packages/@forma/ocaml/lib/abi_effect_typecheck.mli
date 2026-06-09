type effect_registry

val preprocess_effect_type_source : string -> string

val collect_effect_registry :
  Type_env.env ->
  Ast.expr list ->
  (effect_registry, Type_diagnostic.t list) result

val registry_env : effect_registry -> Type_env.env
val rewrite_effect_exprs : Ast.expr list -> Ast.expr list

val collect_effect_typecheck_diagnostics :
  ?source_text:string ->
  effect_registry ->
  Ast.expr list ->
  string list * Type_diagnostic.t list

val annotated_result_type_string :
  source_text:string -> Ast.expr list -> string -> string option
