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

let empty_hooks =
  {
    bindings = (fun _ -> Ok []);
    typed_slots = (fun _ -> Ok ());
    result_type = (fun _ -> Ok None);
    infer = (fun _ -> Ok None);
    check = (fun _ -> Ok None);
  }

let normalize_name name =
  if String.length name > 0 && name.[0] = ':' then
    String.sub name 1 (String.length name - 1)
  else name

let slot_argument = function
  | Core_ast.App (node, Core_ast.Var (_, name), [ expr ]) ->
      Some { slot_name = normalize_name name; span = node.Core_ast.span; expr }
  | _ -> None

let application ?expected env = function
  | Core_ast.App (node, Core_ast.Var (_, name), args)
    when Type_env.lookup name env = Some Type_expr.TFormDescriptor ->
      Some
        {
          form_name = name;
          args;
          span = node.span;
          expected;
          type_env = env;
          slot_arguments = List.filter_map slot_argument args;
        }
  | _ -> None

let is_application env expr = Option.is_some (application env expr)

let with_application_bindings hooks application f =
  match hooks.bindings application with
  | Error _ as error -> error
  | Ok bindings ->
      let scoped_application =
        { application with type_env = bindings @ application.type_env }
      in
      f scoped_application

let infer_for_expr hooks env expr =
  match application env expr with
  | Some application ->
      with_application_bindings hooks application (fun application ->
          match hooks.typed_slots application with
          | Error _ as error -> error
          | Ok () -> (
              match hooks.infer application with
              | Error _ as error -> error
              | Ok None -> (
                  match hooks.result_type application with
                  | Error _ as error -> error
                  | Ok (Some _) as ok -> ok
                  | Ok None -> Ok (Some Type_expr.TDeclaration))
              | Ok (Some _) as ok -> ok))
  | None -> Ok None

let bindings_for_expr hooks env expr =
  match application env expr with
  | Some application -> hooks.bindings application
  | None -> Ok []

let check_for_expr hooks env expr =
  match expr with
  | Core_ast.Ascribe (_, value, type_expr) -> (
      match Type_resolve.resolve env type_expr with
      | Error _ as error -> error
      | Ok expected -> (
          match application ~expected env value with
          | Some application ->
              with_application_bindings hooks application (fun application ->
                  match hooks.check application with
                  | Error diagnostics ->
                      Error
                        (Type_diagnostic.with_span application.span diagnostics)
                  | Ok None -> Ok None
                  | Ok (Some checked) ->
                      Type_unify.unify_with_span application.span expected
                        checked
                      |> Result.map (fun subst ->
                          Some (Type_expr.apply_subst subst expected)))
          | None -> Ok None))
  | _ -> Ok None
