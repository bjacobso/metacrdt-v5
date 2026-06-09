type payload

val make_payload :
  name:string -> index:int -> span:Ast.span -> value:Value.t -> payload

val payload_name : payload -> string
val payload_index : payload -> int
val payload_span : payload -> Ast.span
val payload_value : payload -> Value.t

type spec

val make_spec :
  name:string -> validate:(payload list -> Diagnostic.t list) -> spec

val spec_name : spec -> string
val validate_spec : spec -> payload list -> Diagnostic.t list
val diagnostic : payload -> code:string -> message:string -> Diagnostic.t
