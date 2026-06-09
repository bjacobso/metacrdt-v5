type diagnostic = { span : Ast.span option; code : string; message : string }

val validate_form_clauses : Ast.expr list -> (unit, diagnostic list) result
val validate_meta_fn_clauses : Ast.expr list -> (unit, diagnostic list) result
