type payload = Artifact_validator.payload

let known_validator specs name =
  specs
  |> List.exists (fun (spec : Artifact_validator.spec) ->
      Artifact_validator.spec_name spec = name)

let payloads_for (spec : Artifact_validator.spec) payloads =
  payloads
  |> List.filter_map (fun payload ->
      if
        Artifact_validator.payload_name payload
        = Artifact_validator.spec_name spec
      then Some payload
      else None)

let validate_registered specs payloads =
  specs
  |> List.concat_map (fun (spec : Artifact_validator.spec) ->
      Artifact_validator.validate_spec spec (payloads_for spec payloads))

let unknown_validator_diagnostics specs payloads =
  payloads
  |> List.filter_map (fun payload ->
      if known_validator specs (Artifact_validator.payload_name payload) then
        None
      else
        Some
          (Artifact_validator.diagnostic payload
             ~code:"artifact/unknown-validator"
             ~message:
               (Printf.sprintf "Unknown artifact validator %S."
                  (Artifact_validator.payload_name payload))))

let validate specs payloads =
  unknown_validator_diagnostics specs payloads
  @ validate_registered specs payloads
