val json_escape : string -> string
val string_field : string -> string -> string
val null_json : string
val object_json : string list -> string
val diagnostic_json : code:string -> message:string -> string
val error_json : string list -> string
val error_diagnostics_json : Diagnostic.t list -> string
val reader_diagnostics_json : Reader.diagnostic list -> string
val eval_diagnostics_json : Eval.diagnostic list -> string
val typecheck_diagnostics_json : Type_diagnostic.t list -> string
val lower_diagnostics_json : Lower.diagnostic list -> string
val eval_diagnostics_array : Eval.diagnostic list -> string
val diagnostic_array : Diagnostic.t list -> string
val ast_exprs_json : Ast.expr list -> string
