type engine_manifest

val make_engine_manifest : name:string -> version:string -> engine_manifest
val engine_manifest_name : engine_manifest -> string
val engine_manifest_version : engine_manifest -> string

type source_manifest

val make_source_manifest :
  id:string -> hash:Artifact_package_metadata.source_hash -> source_manifest

val source_manifest_id : source_manifest -> string

val source_manifest_hash :
  source_manifest -> Artifact_package_metadata.source_hash

type provenance_span

val make_provenance_span :
  start_offset:int ->
  end_offset:int ->
  start_line:int option ->
  start_column:int option ->
  end_line:int option ->
  end_column:int option ->
  provenance_span

val provenance_span_start_offset : provenance_span -> int
val provenance_span_end_offset : provenance_span -> int
val provenance_span_start_line : provenance_span -> int option
val provenance_span_start_column : provenance_span -> int option
val provenance_span_end_line : provenance_span -> int option
val provenance_span_end_column : provenance_span -> int option

type declaration_provenance

val make_declaration_provenance :
  declaration_index:int ->
  source_id:string ->
  form_index:int ->
  span:provenance_span ->
  declaration_provenance

val declaration_provenance_index : declaration_provenance -> int
val declaration_provenance_source_id : declaration_provenance -> string
val declaration_provenance_form_index : declaration_provenance -> int
val declaration_provenance_span : declaration_provenance -> provenance_span

type package_declaration

val make_package_declaration :
  value:Artifact_validated_payload.t ->
  provenance:declaration_provenance ->
  type_summary:Artifact_summary_types.declaration_summary ->
  package_declaration

val package_declaration_value :
  package_declaration -> Artifact_validated_payload.t

val package_declaration_provenance :
  package_declaration -> declaration_provenance

val package_declaration_type_summary :
  package_declaration -> Artifact_summary_types.declaration_summary

type package

val make_package :
  ir_version:Artifact_package_metadata.ir_version ->
  kind:Artifact_package_metadata.kind ->
  engine:engine_manifest ->
  session_id:string ->
  hash_algorithm:Artifact_package_metadata.hash_algorithm ->
  source_ids:string list ->
  sources:source_manifest list ->
  preludes:source_manifest list ->
  declarations_hash:Artifact_package_metadata.declarations_hash ->
  declarations:package_declaration list ->
  modules:Module_decl.t list ->
  type_summary:Artifact_summary_types.package_summary ->
  diagnostics:Diagnostic.t list ->
  package

val package_ir_version : package -> Artifact_package_metadata.ir_version
val package_kind : package -> Artifact_package_metadata.kind
val package_engine : package -> engine_manifest
val package_session_id : package -> string
val package_hash_algorithm : package -> Artifact_package_metadata.hash_algorithm
val package_source_ids : package -> string list
val package_sources : package -> source_manifest list
val package_preludes : package -> source_manifest list

val package_declarations_hash :
  package -> Artifact_package_metadata.declarations_hash

val package_declarations : package -> package_declaration list
val package_modules : package -> Module_decl.t list
val package_type_summary : package -> Artifact_summary_types.package_summary
val package_diagnostics : package -> Diagnostic.t list

type artifact

val make_artifact :
  name:string -> media_type:string -> content:package -> artifact

val artifact_name : artifact -> string
val artifact_media_type : artifact -> string
val artifact_content : artifact -> package
