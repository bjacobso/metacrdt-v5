type declaration

val declaration_of_json : Ir_json.t -> declaration option
val declaration_of_runtime_value : Eval.value -> declaration option
val payload_string_field : string -> declaration -> string option
val payload_field : string -> declaration -> Ir_json.t option
val declaration_to_json : declaration -> Ir_json.t
