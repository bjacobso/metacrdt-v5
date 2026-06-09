type diagnostic = Lower_common.diagnostic = {
  span : Ast.span option;
  code : string;
  message : string;
}

val program : Ast.expr list -> (Core_ast.program, diagnostic list) result
val diagnostic_to_json : diagnostic -> string
