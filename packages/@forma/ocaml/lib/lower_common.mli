type diagnostic = { span : Ast.span option; code : string; message : string }

val diagnostic : ?span:Ast.span -> string -> string -> diagnostic
val diagnostic_to_json : diagnostic -> string
