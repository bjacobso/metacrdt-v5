type t = { span : Ast.span option; code : string; message : string }

val make : ?span:Ast.span -> string -> string -> t
val with_span : Ast.span -> t list -> t list
val to_json : t -> string
