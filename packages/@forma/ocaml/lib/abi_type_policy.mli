val apply :
  Abi_request.t ->
  Type_env.env ->
  Ast.expr list ->
  (Type_env.env, Type_diagnostic.t list) result
