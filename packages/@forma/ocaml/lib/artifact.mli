val validate_declarations : Packageable_declaration.t list -> Diagnostic.t list

val canonical_ir_artifact :
  ?modules:Module_decl.t list ->
  engine_name:string ->
  engine_version:string ->
  session_id:string ->
  sources:(string, Source.t) Hashtbl.t ->
  preludes:(string, Source.t) Hashtbl.t ->
  source_ids:string list ->
  Packageable_declaration.t list ->
  (Artifact_types.artifact, Diagnostic.t list) result

val artifact_json : Artifact_types.artifact -> string

val canonical_ir_artifact_json :
  ?modules:Module_decl.t list ->
  engine_name:string ->
  engine_version:string ->
  session_id:string ->
  sources:(string, Source.t) Hashtbl.t ->
  preludes:(string, Source.t) Hashtbl.t ->
  source_ids:string list ->
  Packageable_declaration.t list ->
  string
