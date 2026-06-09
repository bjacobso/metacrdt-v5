type diagnostic = { code : string; path : string; message : string }
type validator = { validate : Canonical_ir_decl.declaration -> diagnostic list }

let diagnostic code path message = { code; path; message }
let diagnostic_code diagnostic = diagnostic.code
let diagnostic_path diagnostic = diagnostic.path
let diagnostic_message diagnostic = diagnostic.message

let query_diagnostic code (d : Canonical_query_decl.diagnostic) =
  diagnostic code
    (Canonical_query_decl.diagnostic_path d)
    (Canonical_query_decl.diagnostic_message d)

let record_diagnostic code (d : Canonical_record_decl.diagnostic) =
  diagnostic code
    (Canonical_record_decl.diagnostic_path d)
    (Canonical_record_decl.diagnostic_message d)

let entity_diagnostic code (d : Canonical_entity_decl.diagnostic) =
  diagnostic code
    (Canonical_entity_decl.diagnostic_path d)
    (Canonical_entity_decl.diagnostic_message d)

let edge_diagnostic code (d : Canonical_edge_decl.diagnostic) =
  diagnostic code
    (Canonical_edge_decl.diagnostic_path d)
    (Canonical_edge_decl.diagnostic_message d)

let operation_diagnostic code (d : Canonical_operation_decl.diagnostic) =
  diagnostic code
    (Canonical_operation_decl.diagnostic_path d)
    (Canonical_operation_decl.diagnostic_message d)

let surface_diagnostic code (d : Canonical_surface_decl.diagnostic) =
  diagnostic code
    (Canonical_surface_decl.diagnostic_path d)
    (Canonical_surface_decl.diagnostic_message d)

let rule_diagnostic code (d : Canonical_rule_decl.diagnostic) =
  diagnostic code
    (Canonical_rule_decl.diagnostic_path d)
    (Canonical_rule_decl.diagnostic_message d)

let workflow_diagnostic code (d : Canonical_workflow_decl.diagnostic) =
  diagnostic code
    (Canonical_workflow_decl.diagnostic_path d)
    (Canonical_workflow_decl.diagnostic_message d)

let content_diagnostic code (d : Canonical_content_decl.diagnostic) =
  diagnostic code
    (Canonical_content_decl.diagnostic_path d)
    (Canonical_content_decl.diagnostic_message d)

let validator code validate map =
  {
    validate = (fun declaration -> validate declaration |> List.map (map code));
  }

let validators =
  [
    validator "artifact/query-payload" Canonical_query_decl.validate_declaration
      query_diagnostic;
    validator "artifact/record-payload"
      Canonical_record_decl.validate_declaration record_diagnostic;
    validator "artifact/entity-payload"
      Canonical_entity_decl.validate_declaration entity_diagnostic;
    validator "artifact/edge-payload" Canonical_edge_decl.validate_declaration
      edge_diagnostic;
    validator "artifact/operation-payload"
      Canonical_operation_decl.validate_declaration operation_diagnostic;
    validator "artifact/surface-payload"
      Canonical_surface_decl.validate_declaration surface_diagnostic;
    validator "artifact/rule-payload" Canonical_rule_decl.validate_declaration
      rule_diagnostic;
    validator "artifact/workflow-payload"
      Canonical_workflow_decl.validate_declaration workflow_diagnostic;
    validator "artifact/content-payload"
      Canonical_content_decl.validate_declaration content_diagnostic;
  ]

let validate_declaration declaration =
  validators
  |> List.concat_map (fun validator -> validator.validate declaration)
