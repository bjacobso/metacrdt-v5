type symbol = { name : string; role : string; resolved : bool }

type annotation = {
  node_id : int;
  span : Ast.span;
  expr : Core_ast.expr;
  typ : Type_expr.ty;
  symbol : symbol option;
}

type program = { result_type : Type_expr.ty; annotations : annotation list }

let symbol ?(resolved = true) role name = { name; role; resolved }

let inferred_symbol = function
  | Core_ast.Var (_, name) -> Some (symbol "reference" name)
  | Core_ast.Def (_, name, _, _) -> Some (symbol "binding" name)
  | Core_ast.TypeDef (_, name, _) -> Some (symbol "type-binding" name)
  | _ -> None

let annotation ?symbol expr typ =
  let node = Core_ast.expr_node expr in
  let symbol =
    match symbol with
    | Some symbol -> Some symbol
    | None -> inferred_symbol expr
  in
  { node_id = node.id; span = node.span; expr; typ; symbol }

let string_json = Value.string_json

let span_to_json span =
  Printf.sprintf "{\"sourceId\":%s,\"startOffset\":%d,\"endOffset\":%d}"
    (string_json span.Ast.source_id)
    span.start_offset span.end_offset

let result_type_string program = Type_expr.ty_to_string program.result_type

let symbol_to_json symbol =
  Printf.sprintf "{\"name\":%s,\"role\":%s,\"resolved\":%s}"
    (string_json symbol.name) (string_json symbol.role)
    (string_of_bool symbol.resolved)

let annotation_to_json annotation =
  Printf.sprintf
    "{\"nodeId\":%d,\"span\":%s,\"type\":%s,\"typeExpr\":%s,\"symbol\":%s,\"expr\":%s}"
    annotation.node_id
    (span_to_json annotation.span)
    (string_json (Type_expr.ty_to_string annotation.typ))
    (Type_expr.to_json annotation.typ)
    (match annotation.symbol with
    | None -> "null"
    | Some symbol -> symbol_to_json symbol)
    (Core_ast.expr_to_json annotation.expr)

let list_json encode values =
  Printf.sprintf "[%s]" (String.concat "," (List.map encode values))

let to_json program =
  Printf.sprintf "{\"resultType\":%s,\"resultTypeExpr\":%s,\"annotations\":%s}"
    (string_json (result_type_string program))
    (Type_expr.to_json program.result_type)
    (list_json annotation_to_json program.annotations)
