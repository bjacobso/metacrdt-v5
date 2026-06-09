type engine_manifest = { name : string; version : string }

type source_manifest = {
  id : string;
  hash : Artifact_package_metadata.source_hash;
}

type provenance_span = {
  start_offset : int;
  end_offset : int;
  start_line : int option;
  start_column : int option;
  end_line : int option;
  end_column : int option;
}

type declaration_provenance = {
  declaration_index : int;
  source_id : string;
  form_index : int;
  span : provenance_span;
}

type package_declaration = {
  value : Artifact_validated_payload.t;
  provenance : declaration_provenance;
  type_summary : Artifact_summary_types.declaration_summary;
}

type package = {
  ir_version : Artifact_package_metadata.ir_version;
  kind : Artifact_package_metadata.kind;
  engine : engine_manifest;
  session_id : string;
  hash_algorithm : Artifact_package_metadata.hash_algorithm;
  source_ids : string list;
  sources : source_manifest list;
  preludes : source_manifest list;
  declarations_hash : Artifact_package_metadata.declarations_hash;
  declarations : package_declaration list;
  modules : Module_decl.t list;
  type_summary : Artifact_summary_types.package_summary;
  diagnostics : Diagnostic.t list;
}

type artifact = { name : string; media_type : string; content : package }

let make_engine_manifest ~name ~version = { name; version }
let engine_manifest_name (engine : engine_manifest) = engine.name
let engine_manifest_version (engine : engine_manifest) = engine.version
let make_source_manifest ~id ~hash = { id; hash }
let source_manifest_id (manifest : source_manifest) = manifest.id
let source_manifest_hash (manifest : source_manifest) = manifest.hash

let make_provenance_span ~start_offset ~end_offset ~start_line ~start_column
    ~end_line ~end_column =
  { start_offset; end_offset; start_line; start_column; end_line; end_column }

let provenance_span_start_offset (span : provenance_span) = span.start_offset
let provenance_span_end_offset (span : provenance_span) = span.end_offset
let provenance_span_start_line (span : provenance_span) = span.start_line
let provenance_span_start_column (span : provenance_span) = span.start_column
let provenance_span_end_line (span : provenance_span) = span.end_line
let provenance_span_end_column (span : provenance_span) = span.end_column

let make_declaration_provenance ~declaration_index ~source_id ~form_index ~span
    =
  { declaration_index; source_id; form_index; span }

let declaration_provenance_index (provenance : declaration_provenance) =
  provenance.declaration_index

let declaration_provenance_source_id (provenance : declaration_provenance) =
  provenance.source_id

let declaration_provenance_form_index (provenance : declaration_provenance) =
  provenance.form_index

let declaration_provenance_span (provenance : declaration_provenance) =
  provenance.span

let make_package_declaration ~value ~provenance ~type_summary =
  { value; provenance; type_summary }

let package_declaration_value (declaration : package_declaration) =
  declaration.value

let package_declaration_provenance (declaration : package_declaration) =
  declaration.provenance

let package_declaration_type_summary (declaration : package_declaration) =
  declaration.type_summary

let make_package ~ir_version ~kind ~engine ~session_id ~hash_algorithm
    ~source_ids ~sources ~preludes ~declarations_hash ~declarations ~modules
    ~type_summary ~diagnostics =
  {
    ir_version;
    kind;
    engine;
    session_id;
    hash_algorithm;
    source_ids;
    sources;
    preludes;
    declarations_hash;
    declarations;
    modules;
    type_summary;
    diagnostics;
  }

let package_ir_version (package : package) = package.ir_version
let package_kind (package : package) = package.kind
let package_engine (package : package) = package.engine
let package_session_id (package : package) = package.session_id
let package_hash_algorithm (package : package) = package.hash_algorithm
let package_source_ids (package : package) = package.source_ids
let package_sources (package : package) = package.sources
let package_preludes (package : package) = package.preludes
let package_declarations_hash (package : package) = package.declarations_hash
let package_declarations (package : package) = package.declarations
let package_modules (package : package) = package.modules
let package_type_summary (package : package) = package.type_summary
let package_diagnostics (package : package) = package.diagnostics
let make_artifact ~name ~media_type ~content = { name; media_type; content }
let artifact_name (artifact : artifact) = artifact.name
let artifact_media_type (artifact : artifact) = artifact.media_type
let artifact_content (artifact : artifact) = artifact.content
