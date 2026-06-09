type declaration = Packageable_declaration.t

let validate_payload_contracts declarations =
  declarations
  |> List.mapi Artifact_payload_contract.validate_packageable_declaration
  |> List.concat

let validator_payloads declarations =
  declarations
  |> List.mapi (fun index (declaration : declaration) ->
      Packageable_declaration.validators declaration
      |> List.map (fun (validator : Packageable_declaration.validator) ->
          Artifact_validator.make_payload
            ~name:(Packageable_declaration.validator_name validator)
            ~index
            ~span:(Packageable_declaration.span declaration)
            ~value:(Packageable_declaration.validator_value validator)))
  |> List.concat

let validate_declarations (declarations : declaration list) =
  validate_payload_contracts declarations
  @ Artifact_validator_registry.validate Artifact_validator_catalog.builtins
      (validator_payloads declarations)
