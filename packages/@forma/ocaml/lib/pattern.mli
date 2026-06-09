type bindings = (string * Value.t) list

val match_value : Ast.expr -> Value.t -> bindings option
