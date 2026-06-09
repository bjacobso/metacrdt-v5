type diagnostic = Lower_common.diagnostic = {
  span : Ast.span option;
  code : string;
  message : string;
}

val parse_type_expr : Ast.expr -> (Core_ast.type_expr, diagnostic list) result

val attach_signature :
  Core_ast.type_expr -> Core_ast.expr -> (Core_ast.expr, diagnostic list) result

val type_signature : Ast.expr -> (string * Ast.expr) option
val definition_name : Ast.expr -> string option
