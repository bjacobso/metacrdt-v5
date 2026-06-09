let mismatch_diagnostic span message =
  ({ Eval.span = Some span; code = "artifact/summary-mismatch"; message }
    : Eval.diagnostic)

let mismatch span field expected actual =
  mismatch_diagnostic span
    (Printf.sprintf
       "Declaration payload %s %S does not match declaration summary %s %S."
       field actual field expected)

let package_diagnostic ?path span code message =
  Diagnostic.error ?path ~span ~code ~message ()

let package_mismatch ~path span field expected actual =
  package_diagnostic ~path span "artifact/summary-mismatch"
    (Printf.sprintf
       "Declaration payload %s %S does not match declaration summary %s %S."
       field actual field expected)

let kind_name = function
  | Artifact_payload_descriptor.String -> "string"
  | Artifact_payload_descriptor.Array -> "array"
  | Artifact_payload_descriptor.Object -> "object"

let matches_kind kind value =
  match (kind, value) with
  | Artifact_payload_descriptor.String, Ir_json.String _ -> true
  | Artifact_payload_descriptor.Array, Ir_json.Array _ -> true
  | Artifact_payload_descriptor.Object, Ir_json.Object _ -> true
  | _ -> false

let validate_constraint ~diagnostic span
    (constraint_ : Artifact_payload_descriptor.field_constraint) payload =
  let field = Artifact_payload_descriptor.field_constraint_field constraint_ in
  match Canonical_ir_decl.payload_field field payload with
  | None -> []
  | Some value ->
      let kind_diagnostics =
        match Artifact_payload_descriptor.field_constraint_kind constraint_ with
        | Some kind when not (matches_kind kind value) ->
            [
              diagnostic span
                (Printf.sprintf
                   "Declaration payload field %s must be a %s value by its \
                    descriptor artifact contract."
                   field (kind_name kind));
            ]
        | _ -> []
      in
      let literal_diagnostics =
        match
          ( Artifact_payload_descriptor.field_constraint_literal constraint_,
            value )
        with
        | Some expected, Ir_json.String actual when actual <> expected ->
            [
              diagnostic span
                (Printf.sprintf
                   "Declaration payload field %s literal %S does not match \
                    descriptor artifact contract literal %S."
                   field actual expected);
            ]
        | Some _, Ir_json.String _ -> []
        | Some expected, _ ->
            [
              diagnostic span
                (Printf.sprintf
                   "Declaration payload field %s must be textual literal %S by \
                    its descriptor artifact contract."
                   field expected);
            ]
        | None, _ -> []
      in
      kind_diagnostics @ literal_diagnostics

let validate_constraints ~diagnostic span contract payload =
  Artifact_payload_descriptor.contract_field_constraints contract
  |> List.concat_map (fun constraint_ ->
      validate_constraint ~diagnostic span constraint_ payload)

let validate_payload_summary ~span
    ~(contract : Artifact_payload_descriptor.contract)
    (summary : Artifact_summary_types.declaration_summary)
    (declaration : Canonical_ir_decl.declaration) =
  let summary_kind = Artifact_summary_types.declaration_summary_kind summary in
  let summary_name = Artifact_summary_types.declaration_summary_name summary in
  let required_field_diagnostics =
    Artifact_payload_descriptor.contract_required_fields contract
    |> List.filter_map (fun field ->
        match Canonical_ir_decl.payload_field field declaration with
        | Some _ -> None
        | None ->
            Some
              (mismatch_diagnostic span
                 (Printf.sprintf
                    "Declaration payload must include a %s field required by \
                     its descriptor artifact contract."
                    field)))
  in
  let kind_diagnostics =
    match Canonical_ir_decl.payload_string_field "kind" declaration with
    | Some actual when actual <> summary_kind ->
        [ mismatch span "kind" summary_kind actual ]
    | Some _ -> []
    | None ->
        [
          mismatch_diagnostic span
            "Declaration payload must include a textual kind field.";
        ]
  in
  let name_diagnostics =
    match
      (Canonical_ir_decl.payload_string_field "name" declaration, summary_name)
    with
    | Some actual, Some expected when actual <> expected ->
        [ mismatch span "name" expected actual ]
    | _ -> []
  in
  required_field_diagnostics
  @ validate_constraints ~diagnostic:mismatch_diagnostic span contract
      declaration
  @ kind_diagnostics @ name_diagnostics

let typed_protocol_diagnostic span
    (diagnostic : Artifact_typed_payload_validator.diagnostic) =
  ({
     Eval.span = Some span;
     code = Artifact_typed_payload_validator.diagnostic_code diagnostic;
     message = Artifact_typed_payload_validator.diagnostic_message diagnostic;
   }
    : Eval.diagnostic)

let validate_typed_payload_protocol span declaration =
  Artifact_typed_payload_validator.validate_declaration declaration
  |> List.map (typed_protocol_diagnostic span)

let of_declaration ~span ~(summary : Artifact_summary_types.declaration_summary)
    ~contract declaration =
  match
    validate_payload_summary ~span ~contract summary declaration
    @ validate_typed_payload_protocol span declaration
  with
  | [] ->
      Ok
        (Packageable_declaration.make_payload
           ~value:(Artifact_validated_payload.of_declaration declaration))
  | diagnostics -> Error diagnostics

let validate_required_package_fields ~path span
    (contract : Artifact_payload_descriptor.contract) payload =
  Artifact_payload_descriptor.contract_required_fields contract
  |> List.filter_map (fun field ->
      match Canonical_ir_decl.payload_field field payload with
      | Some _ -> None
      | None ->
          Some
            (package_diagnostic ~path span "artifact/summary-mismatch"
               (Printf.sprintf
                  "Declaration payload must include a %s field required by its \
                   descriptor artifact contract."
                  field)))

let package_constraint_diagnostic ~path span message =
  package_diagnostic ~path span "artifact/summary-mismatch" message

let append_json_path path child =
  if String.length child > 0 && child.[0] = '$' then
    path ^ String.sub child 1 (String.length child - 1)
  else path ^ child

let package_typed_protocol_diagnostic ~path span
    (diagnostic : Artifact_typed_payload_validator.diagnostic) =
  package_diagnostic
    ~path:
      (append_json_path path
         (Artifact_typed_payload_validator.diagnostic_path diagnostic))
    span
    (Artifact_typed_payload_validator.diagnostic_code diagnostic)
    (Artifact_typed_payload_validator.diagnostic_message diagnostic)

let validate_packageable_declaration index
    (declaration : Packageable_declaration.t) =
  let path = Printf.sprintf "$.declarations[%d]" index in
  let span = Packageable_declaration.span declaration in
  let summary = Packageable_declaration.summary declaration in
  let summary_kind = Artifact_summary_types.declaration_summary_kind summary in
  let summary_name = Artifact_summary_types.declaration_summary_name summary in
  let payload_contract = Packageable_declaration.payload_contract declaration in
  let payload =
    Artifact_validated_payload.canonical_declaration
      (Packageable_declaration.payload_value
         (Packageable_declaration.payload declaration))
  in
  let kind_diagnostics =
    match Canonical_ir_decl.payload_string_field "kind" payload with
    | Some actual when actual <> summary_kind ->
        [ package_mismatch ~path span "kind" summary_kind actual ]
    | Some _ -> []
    | None ->
        [
          package_diagnostic ~path span "artifact/summary-mismatch"
            "Declaration payload must include a textual kind field.";
        ]
  in
  let name_diagnostics =
    match
      (Canonical_ir_decl.payload_string_field "name" payload, summary_name)
    with
    | Some actual, Some expected when actual <> expected ->
        [ package_mismatch ~path span "name" expected actual ]
    | _ -> []
  in
  validate_required_package_fields ~path span payload_contract payload
  @ validate_constraints
      ~diagnostic:(package_constraint_diagnostic ~path)
      span payload_contract payload
  @ (Artifact_typed_payload_validator.validate_declaration payload
    |> List.map (package_typed_protocol_diagnostic ~path span))
  @ kind_diagnostics @ name_diagnostics
