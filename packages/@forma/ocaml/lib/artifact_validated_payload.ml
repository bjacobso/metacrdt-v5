type t = { declaration : Canonical_ir_decl.declaration }

let of_declaration declaration = { declaration }

let canonical_json payload =
  Canonical_ir_decl.declaration_to_json payload.declaration

let canonical_declaration payload = payload.declaration
