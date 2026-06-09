type symbol = { name : string; role : string; resolved : bool }

type annotation = {
  node_id : int;
  span : Ast.span;
  expr : Core_ast.expr;
  typ : Type_expr.ty;
  symbol : symbol option;
}

type program = { result_type : Type_expr.ty; annotations : annotation list }

val symbol : ?resolved:bool -> string -> string -> symbol
val annotation : ?symbol:symbol -> Core_ast.expr -> Type_expr.ty -> annotation
val result_type_string : program -> string
val to_json : program -> string
