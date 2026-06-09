type diagnostic = { span : Ast.span option; code : string; message : string }

val diagnostic : ?span:Ast.span -> string -> string -> diagnostic
val with_span : Ast.span -> diagnostic list -> diagnostic list
