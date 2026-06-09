type declaration_summary

val make_declaration_summary :
  kind:string -> name:string option -> type_name:string -> declaration_summary

val declaration_summary_kind : declaration_summary -> string
val declaration_summary_name : declaration_summary -> string option
val declaration_summary_result_type : declaration_summary -> string

type package_summary

val make_package_summary :
  declaration_count:int -> result_types:(string * int) list -> package_summary

val package_summary_declaration_count : package_summary -> int
val package_summary_result_types : package_summary -> (string * int) list

type derived_manifest

val make_derived_manifest :
  kind:string ->
  target:string ->
  source_kind:string ->
  source_ir_version:string ->
  declaration_count:int ->
  declarations:declaration_summary list ->
  derived_manifest

val derived_manifest_kind : derived_manifest -> string
val derived_manifest_target : derived_manifest -> string
val derived_manifest_source_kind : derived_manifest -> string
val derived_manifest_source_ir_version : derived_manifest -> string
val derived_manifest_declaration_count : derived_manifest -> int
val derived_manifest_declarations : derived_manifest -> declaration_summary list
