type diagnostic = Type_diagnostic.t
type env = Type_env.env

type slot_argument = {
  slot_name : string;
  span : Ast.span;
  expr : Core_ast.expr;
}

type descriptor_application = {
  form_name : string;
  args : Core_ast.expr list;
  span : Ast.span;
  expected : Type_expr.ty option;
  type_env : env;
  slot_arguments : slot_argument list;
}

type descriptor_hooks = {
  bindings : descriptor_application -> (env, diagnostic list) result;
  typed_slots : descriptor_application -> (unit, diagnostic list) result;
  result_type :
    descriptor_application -> (Type_expr.ty option, diagnostic list) result;
  infer :
    descriptor_application -> (Type_expr.ty option, diagnostic list) result;
  check :
    descriptor_application -> (Type_expr.ty option, diagnostic list) result;
}

val empty_hooks : descriptor_hooks

val application :
  ?expected:Type_expr.ty ->
  env ->
  Core_ast.expr ->
  descriptor_application option

val is_application : env -> Core_ast.expr -> bool

val infer_for_expr :
  descriptor_hooks ->
  env ->
  Core_ast.expr ->
  (Type_expr.ty option, diagnostic list) result

val bindings_for_expr :
  descriptor_hooks -> env -> Core_ast.expr -> (env, diagnostic list) result

val check_for_expr :
  descriptor_hooks ->
  env ->
  Core_ast.expr ->
  (Type_expr.ty option, diagnostic list) result
