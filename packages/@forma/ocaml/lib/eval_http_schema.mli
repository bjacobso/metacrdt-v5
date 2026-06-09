type value = Value.t

type diagnostic = Eval_common.diagnostic = {
  span : Ast.span option;
  code : string;
  message : string;
}

type context = {
  eval_expr : Env.t -> Reader.expr -> (value, diagnostic list) result;
}

val first_slot_value : value -> string -> value
val all_slot_values : value -> string -> value list
val schema_expr_to_ir : value -> (Http_ir.schema, diagnostic list) result

val schema_fields_to_ir :
  value list -> (Http_ir.field list, diagnostic list) result

val annotation_entries : value -> (string * value) list -> (string * value) list

val schema_decl :
  context -> Env.t -> Reader.expr list -> (value, diagnostic list) result

val error_decl :
  context -> Env.t -> Reader.expr list -> (value, diagnostic list) result
