let rec symbol_names = function
  | Ast.Symbol (_, name) -> [ name ]
  | Ast.List (_, exprs) | Ast.Vector (_, exprs) ->
      exprs |> List.concat_map symbol_names
  | Ast.Map (_, entries) ->
      entries
      |> List.concat_map (fun (key, value) ->
          symbol_names key @ symbol_names value)
  | Ast.Nil _ | Ast.Bool _ | Ast.Int _ | Ast.Float _ | Ast.String _
  | Ast.Keyword _ ->
      []

let symbol_matches_policy (policy : Abi_request.unbound_symbol_policy) symbol =
  match policy.match_.kind with
  | "exact" -> String.equal symbol policy.match_.value
  | "prefix" ->
      let prefix = policy.match_.value in
      let prefix_len = String.length prefix in
      String.length symbol >= prefix_len
      && String.equal (String.sub symbol 0 prefix_len) prefix
  | _ -> false

let policy_type (policy : Abi_request.unbound_symbol_policy) =
  match policy.type_kind with
  | Some kind when kind <> "type" ->
      Error
        [
          Type_diagnostic.make "typecheck/type-policy"
            (Printf.sprintf
               "Unsupported unbound symbol policy type kind %S. Expected %S."
               kind "type");
        ]
  | _ -> (
      match policy.type_name with
      | "Int" -> Ok Type_expr.TInt
      | "Float" -> Ok Type_expr.TFloat
      | "Bool" | "Boolean" -> Ok Type_expr.TBool
      | "Str" | "String" -> Ok Type_expr.TString
      | "Unit" | "Nil" -> Ok Type_expr.TNil
      | "Keyword" -> Ok Type_expr.TKeyword
      | "Symbol" -> Ok Type_expr.TSymbol
      | "Syntax" -> Ok Type_expr.TSyntax
      | "Any" -> Ok Type_expr.TAny
      | name ->
          Error
            [
              Type_diagnostic.make "typecheck/type-policy"
                (Printf.sprintf
                   "Unsupported unbound symbol policy type %S. Expected a \
                    primitive type."
                   name);
            ])

let rec scheme_type = function
  | Abi_request.Scheme_type name -> primitive_type name
  | Abi_request.Scheme_function (params, result) -> (
      match (list_result scheme_type params, scheme_type result) with
      | Ok params, Ok result -> Ok (Type_expr.TFn (params, result))
      | (Error _ as error), _ -> error
      | _, (Error _ as error) -> error)
  | Abi_request.Scheme_variadic_function (params, rest, result) -> (
      match
        (list_result scheme_type params, scheme_type rest, scheme_type result)
      with
      | Ok params, Ok rest, Ok result ->
          Ok (Type_expr.TVariadicFn (params, rest, result))
      | (Error _ as error), _, _ -> error
      | _, (Error _ as error), _ -> error
      | _, _, (Error _ as error) -> error)
  | Abi_request.Scheme_list item -> (
      match scheme_type item with
      | Ok item -> Ok (Type_expr.TList item)
      | Error _ as error -> error)
  | Abi_request.Scheme_map (_key, _value) -> Ok Type_expr.TMap
  | Abi_request.Scheme_any -> Ok Type_expr.TAny
  | Abi_request.Scheme_unsupported kind ->
      Error
        [
          Type_diagnostic.make "typecheck/host-builtin"
            (Printf.sprintf "Unsupported host builtin type scheme kind %S." kind);
        ]

and primitive_type = function
  | "Number" | "Num" | "Int" -> Ok Type_expr.TInt
  | "Float" -> Ok Type_expr.TFloat
  | "Bool" | "Boolean" -> Ok Type_expr.TBool
  | "Str" | "String" -> Ok Type_expr.TString
  | "Unit" | "Nil" -> Ok Type_expr.TNil
  | "Keyword" -> Ok Type_expr.TKeyword
  | "Symbol" -> Ok Type_expr.TSymbol
  | "Syntax" -> Ok Type_expr.TSyntax
  | "Any" | "Unknown" -> Ok Type_expr.TAny
  | "Map" -> Ok Type_expr.TMap
  | "List" -> Ok (Type_expr.TList Type_expr.TAny)
  | "Vector" -> Ok (Type_expr.TVector Type_expr.TAny)
  | "Declaration" -> Ok Type_expr.TDeclaration
  | name -> Ok (Type_expr.TNamed name)

and list_result f values =
  let rec loop acc = function
    | [] -> Ok (List.rev acc)
    | value :: rest -> (
        match f value with
        | Ok mapped -> loop (mapped :: acc) rest
        | Error _ as error -> error)
  in
  loop [] values

let bind_host_builtins request env =
  let bind_builtin env (builtin : Abi_request.host_builtin_descriptor) =
    match builtin.type_scheme with
    | None -> Ok env
    | Some type_scheme -> (
        match scheme_type type_scheme with
        | Error _ as error -> error
        | Ok ty ->
            Ok
              (Type_env.bind builtin.name
                 (Type_env.Forall ([], ty, [], Type_env.Plain))
                 env))
  in
  let rec loop env = function
    | [] -> Ok env
    | builtin :: rest -> (
        match bind_builtin env builtin with
        | Error _ as error -> error
        | Ok env -> loop env rest)
  in
  loop env request.Abi_request.host_builtins

let apply request env exprs =
  let env =
    match request.Abi_request.type_policy with
    | Some { default_builtin_scheme = Some "none"; _ } ->
        Type_env.disable_builtins env
    | _ -> env
  in
  let apply_unbound_policy env =
    match request.Abi_request.type_policy with
    | None -> Ok env
    | Some { unbound_symbols = []; _ } -> Ok env
    | Some { unbound_symbols; _ } ->
        let symbols =
          exprs |> List.concat_map symbol_names |> List.sort_uniq String.compare
        in
        let bind_symbol env symbol =
          match Type_env.lookup_scheme symbol env with
          | Some _ -> Ok env
          | None -> (
              match
                List.find_opt
                  (fun policy -> symbol_matches_policy policy symbol)
                  unbound_symbols
              with
              | None -> Ok env
              | Some policy -> (
                  match policy_type policy with
                  | Error _ as error -> error
                  | Ok ty ->
                      Ok
                        (Type_env.bind symbol
                           (Type_env.Forall ([], ty, [], Type_env.Plain))
                           env)))
        in
        let rec loop env = function
          | [] -> Ok env
          | symbol :: rest -> (
              match bind_symbol env symbol with
              | Error _ as error -> error
              | Ok env -> loop env rest)
        in
        loop env symbols
  in
  match bind_host_builtins request env with
  | Error _ as error -> error
  | Ok env -> apply_unbound_policy env
