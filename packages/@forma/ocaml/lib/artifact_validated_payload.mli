type t

val of_declaration : Canonical_ir_decl.declaration -> t
val canonical_json : t -> Ir_json.t
val canonical_declaration : t -> Canonical_ir_decl.declaration
