type module_use = { prelude : string }

type module_import = {
  specifier : string;
  resolved_path : string option;
  module_id : string option;
  mode : string;
  alias : string option;
  names : string list;
}

type module_re_export = {
  specifier : string;
  resolved_path : string option;
  module_id : string option;
  names : string list;
}

type alias_reference = { alias : string; local_name : string }

type module_diagnostic = { code : string; message : string }

type t = {
  module_id : string;
  source_path : string;
  used_preludes : module_use list;
  imports : module_import list;
  explicit_exports : string list;
  re_exports : module_re_export list;
  diagnostics : module_diagnostic list;
  alias_references : alias_reference list;
  unqualified_references : string list;
}

type declaration = {
  local_name : string;
  kind : string;
  canonical_name : string;
}

type analysis = { decl : t; source_exprs : Ast.expr list }

val analyze :
  ?resolve_exports:(string -> string list option) ->
  source_id:string -> known_source_ids:string list -> Ast.expr list -> analysis
