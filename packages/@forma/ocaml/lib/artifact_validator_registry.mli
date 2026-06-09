type payload = Artifact_validator.payload

val validate : Artifact_validator.spec list -> payload list -> Diagnostic.t list
