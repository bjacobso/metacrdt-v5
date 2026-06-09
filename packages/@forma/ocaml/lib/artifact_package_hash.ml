let declaration_values_json declarations =
  declarations
  |> List.map (fun (declaration : Artifact_types.package_declaration) ->
      Artifact_validated_payload.canonical_json
        (Artifact_types.package_declaration_value declaration))
  |> fun values -> Ir_json.to_string (Ir_json.Array values)

let hash_declarations ~algorithm declarations =
  Artifact_package_metadata.hash_declarations algorithm
    (declaration_values_json declarations)
