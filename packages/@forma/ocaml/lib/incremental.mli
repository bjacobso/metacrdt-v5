type form = { index : int; span : Ast.span; digest : string }
type snapshot = { source_id : string; forms : form list }

val snapshot : source_id:string -> Ast.expr list -> snapshot
val snapshot_json : snapshot -> string
