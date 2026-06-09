type diagnostic

val diagnostic_code : diagnostic -> string
val diagnostic_path : diagnostic -> string
val diagnostic_message : diagnostic -> string
val validate_declaration : Canonical_ir_decl.declaration -> diagnostic list
