type declaration

val make_declaration :
  index:int -> span:Ast.span -> value:Http_ir.value -> declaration

val declaration_index : declaration -> int
val declaration_span : declaration -> Ast.span
val declaration_value : declaration -> Http_ir.value
val validate_declarations : declaration list -> Diagnostic.t list
