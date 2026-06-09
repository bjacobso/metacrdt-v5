type typeclass_constraint = { class_name : string; args : Type_expr.ty list }
type typeclass_method = { class_name : string; class_var_ids : int list }

type binding_info =
  | Plain
  | TypeclassMethod of typeclass_method
  | TypeclassInstance of { class_name : string; type_args : Type_expr.ty list }

type scheme =
  | Forall of int list * Type_expr.ty * typeclass_constraint list * binding_info

type env = (string * scheme) list

val free_scheme : scheme -> int list
val free_env : env -> int list
val apply_subst_scheme : Type_expr.subst -> scheme -> scheme
val apply_subst_env : Type_expr.subst -> env -> env
val instantiate : scheme -> Type_expr.ty
val instantiate_with_subst : scheme -> Type_expr.ty * Type_expr.subst

val instantiate_with_subst_at :
  Ast.span -> scheme -> Type_expr.ty * Type_expr.subst

val generalize : env -> Type_expr.ty -> scheme
val generalize_binding : env -> Type_expr.ty -> int -> scheme
val lookup : string -> env -> Type_expr.ty option
val lookup_scheme : string -> env -> scheme option
val builtins_enabled : env -> bool
val lookup_typeclass_method : string -> env -> typeclass_method option
val lookup_typeclass_instances : string -> env -> Type_expr.ty list list
val pending_constraints_count : unit -> int
val reset_pending_constraints : unit -> unit
val with_pending_reset : (unit -> ('a, 'error) result) -> ('a, 'error) result

val discharge_pending_constraints :
  env -> Type_expr.subst -> (unit, Type_diagnostic.t list) result

val discharge_and_return :
  env -> Type_expr.subst -> 'a -> ('a, Type_diagnostic.t list) result

val discharge_and_apply :
  env ->
  Type_expr.subst ->
  Type_expr.ty ->
  (Type_expr.ty, Type_diagnostic.t list) result

val bind : string -> scheme -> env -> env
val disable_builtins : env -> env
val bind_typeclass_method : string -> string -> int list -> scheme -> env -> env
val bind_typeclass_instance : string -> Type_expr.ty list -> env -> env
