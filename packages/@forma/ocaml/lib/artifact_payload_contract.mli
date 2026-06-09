val of_declaration :
  span:Ast.span ->
  summary:Artifact_summary_types.declaration_summary ->
  contract:Artifact_payload_descriptor.contract ->
  Canonical_ir_decl.declaration ->
  (Packageable_declaration.payload, Eval.diagnostic list) result

val validate_packageable_declaration :
  int -> Packageable_declaration.t -> Diagnostic.t list
