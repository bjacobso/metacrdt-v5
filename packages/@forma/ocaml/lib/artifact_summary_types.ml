type declaration_summary = {
  kind : string;
  name : string option;
  result_type : string;
}

let make_declaration_summary ~kind ~name ~type_name =
  { kind; name; result_type = type_name }

let declaration_summary_kind summary = summary.kind
let declaration_summary_name summary = summary.name
let declaration_summary_result_type summary = summary.result_type

type package_summary = {
  declaration_count : int;
  result_types : (string * int) list;
}

let make_package_summary ~declaration_count ~result_types =
  { declaration_count; result_types }

let package_summary_declaration_count summary = summary.declaration_count
let package_summary_result_types summary = summary.result_types

type derived_manifest = {
  kind : string;
  target : string;
  source_kind : string;
  source_ir_version : string;
  declaration_count : int;
  declarations : declaration_summary list;
}

let make_derived_manifest ~kind ~target ~source_kind ~source_ir_version
    ~declaration_count ~declarations =
  {
    kind;
    target;
    source_kind;
    source_ir_version;
    declaration_count;
    declarations;
  }

let derived_manifest_kind manifest = manifest.kind
let derived_manifest_target manifest = manifest.target
let derived_manifest_source_kind manifest = manifest.source_kind
let derived_manifest_source_ir_version manifest = manifest.source_ir_version
let derived_manifest_declaration_count manifest = manifest.declaration_count
let derived_manifest_declarations manifest = manifest.declarations
