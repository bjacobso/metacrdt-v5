type payload = Artifact_validator.payload

let http_declarations payloads =
  payloads
  |> List.map (fun (payload : payload) ->
      Http_ir_validation.make_declaration
        ~index:(Artifact_validator.payload_index payload)
        ~span:(Artifact_validator.payload_span payload)
        ~value:(Artifact_validator.payload_value payload))

let validate payloads =
  Http_ir_validation.validate_declarations (http_declarations payloads)

let spec = Artifact_validator.make_spec ~name:"http" ~validate
