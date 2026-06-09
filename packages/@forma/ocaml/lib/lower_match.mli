type diagnostic = Lower_common.diagnostic = {
  span : Ast.span option;
  code : string;
  message : string;
}

val lower_match :
  (Ast.expr -> (Core_ast.expr, diagnostic list) result) ->
  Ast.expr ->
  Ast.expr list ->
  (Core_ast.expr, diagnostic list) result
