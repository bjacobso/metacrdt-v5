type diagnostic = Type_diagnostic.t

open Type_expr
open Type_env
open Type_unify

type env = Type_env.env

type callbacks = {
  infer_expr : env -> Core_ast.expr -> (subst * ty, diagnostic list) result;
}

let diagnostic = Type_diagnostic.make

let map_type_mismatch ty =
  diagnostic "typecheck/type-mismatch"
    (Printf.sprintf "Expected Map, received %s." (ty_to_string ty))

let ensure_map_like subst record_ty =
  let record_ty = apply_subst subst record_ty in
  match record_ty with
  | TVar _ -> (
      match unify record_ty TMap with
      | Ok map_subst ->
          let subst = compose_subst map_subst subst in
          Ok (subst, apply_subst subst record_ty)
      | Error _ as error -> error)
  | _ -> Ok (subst, record_ty)

let infer_record callbacks env fields =
  let rec loop subst env = function
    | [] -> Ok (subst, TRecord [])
    | (field : Core_ast.field) :: rest -> (
        match callbacks.infer_expr env field.value with
        | Error _ as error -> error
        | Ok (field_subst, field_ty) -> (
            let subst = compose_subst field_subst subst in
            match loop subst (apply_subst_env subst env) rest with
            | Error _ as error -> error
            | Ok (subst, TRecord rest_fields) ->
                Ok
                  ( subst,
                    TRecord
                      (sort_record_fields
                         ((field.label, apply_subst subst field_ty)
                         :: rest_fields)) )
            | Ok _ -> assert false))
  in
  loop [] env fields

let infer_get_field subst record_ty label =
  match ensure_map_like subst record_ty with
  | Error _ as error -> error
  | Ok (subst, record_ty) -> (
      match record_ty with
      | TRecord fields -> (
          match List.assoc_opt label fields with
          | Some ty -> Ok (subst, apply_subst subst ty)
          | None ->
              Error
                [
                  diagnostic "typecheck/missing-field"
                    (Printf.sprintf "Record has no field %S." label);
                ])
      | TMap | TAny -> Ok (subst, TAny)
      | other -> Error [ map_type_mismatch other ])

let record_label_of_key = function
  | Core_ast.Lit (_, Core_ast.LKeyword label)
  | Core_ast.Lit (_, Core_ast.LString label) ->
      Some label
  | _ -> None

let record_labels_of_keys keys =
  let rec loop acc = function
    | [] -> Some (List.rev acc)
    | key :: rest -> (
        match record_label_of_key key with
        | Some label -> loop (label :: acc) rest
        | None -> None)
  in
  loop [] keys

let record_labels_of_key_collection = function
  | Core_ast.App (_, Core_ast.Var (_, ("__vector" | "list")), keys) ->
      record_labels_of_keys keys
  | _ -> None

let rec infer_record_path subst record_ty labels =
  match labels with
  | [] -> Ok (subst, apply_subst subst record_ty)
  | label :: rest -> (
      match ensure_map_like subst record_ty with
      | Error _ as error -> error
      | Ok (subst, record_ty) -> (
          match record_ty with
          | TRecord fields -> (
              match List.assoc_opt label fields with
              | Some ty -> infer_record_path subst ty rest
              | None ->
                  Error
                    [
                      diagnostic "typecheck/missing-field"
                        (Printf.sprintf "Record has no field %S." label);
                    ])
          | TMap | TAny -> Ok (subst, TAny)
          | other -> Error [ map_type_mismatch other ]))

let infer_get_in_result subst record_ty path =
  match record_labels_of_key_collection path with
  | Some labels -> infer_record_path subst record_ty labels
  | None -> Ok (subst, TAny)

let rec infer_get_in callbacks env = function
  | [ record; path ] | [ record; path; Core_ast.Lit (_, Core_ast.LNil) ] -> (
      match callbacks.infer_expr env record with
      | Error _ as error -> error
      | Ok (record_subst, record_ty) -> (
          let env = apply_subst_env record_subst env in
          match callbacks.infer_expr env path with
          | Error _ as error -> error
          | Ok (path_subst, _) ->
              let subst = compose_subst path_subst record_subst in
              infer_get_in_result subst record_ty path))
  | [ record; path; default_value ] -> (
      match infer_get_in callbacks env [ record; path ] with
      | Error _ as error -> error
      | Ok (path_subst, path_ty) -> (
          let env = apply_subst_env path_subst env in
          match callbacks.infer_expr env default_value with
          | Error _ as error -> error
          | Ok (default_subst, default_ty) -> (
              let subst = compose_subst default_subst path_subst in
              match
                unify (apply_subst subst path_ty) (apply_subst subst default_ty)
              with
              | Error _ -> Ok (subst, TAny)
              | Ok default_unify_subst ->
                  let subst = compose_subst default_unify_subst subst in
                  Ok (subst, apply_subst subst path_ty))))
  | _ ->
      Error
        [
          diagnostic "typecheck/arity"
            "get-in expects a collection, path, and optional default.";
        ]

let infer_assoc_result subst record_ty key value_ty =
  match ensure_map_like subst record_ty with
  | Error _ as error -> error
  | Ok (subst, record_ty) -> (
      match record_ty with
      | TRecord fields -> (
          match record_label_of_key key with
          | Some label ->
              Ok
                ( subst,
                  TRecord
                    (upsert_record_field label
                       (apply_subst subst value_ty)
                       fields) )
          | None -> Ok (subst, TMap))
      | TMap | TAny -> Ok (subst, TMap)
      | other -> Error [ map_type_mismatch other ])

let infer_assoc callbacks env = function
  | [ record; key; value ] -> (
      match callbacks.infer_expr env record with
      | Error _ as error -> error
      | Ok (record_subst, record_ty) -> (
          let env = apply_subst_env record_subst env in
          match callbacks.infer_expr env key with
          | Error _ as error -> error
          | Ok (key_subst, _) -> (
              let subst = compose_subst key_subst record_subst in
              let env = apply_subst_env subst env in
              match callbacks.infer_expr env value with
              | Error _ as error -> error
              | Ok (value_subst, value_ty) ->
                  let subst = compose_subst value_subst subst in
                  infer_assoc_result subst record_ty key value_ty)))
  | _ ->
      Error
        [ diagnostic "typecheck/arity" "assoc expects a map, key, and value." ]

let infer_merge callbacks env args =
  let rec loop subst env fields = function
    | [] ->
        let ty =
          match fields with
          | Some fields -> TRecord (sort_record_fields fields)
          | None -> TMap
        in
        Ok (subst, ty)
    | expr :: rest -> (
        match callbacks.infer_expr env expr with
        | Error _ as error -> error
        | Ok (expr_subst, ty) -> (
            let subst = compose_subst expr_subst subst in
            match ensure_map_like subst ty with
            | Error _ as error -> error
            | Ok (subst, ty) -> (
                let env = apply_subst_env subst env in
                match (fields, apply_subst subst ty) with
                | Some fields, TRecord next_fields ->
                    loop subst env
                      (Some (merge_record_fields fields next_fields))
                      rest
                | (Some _ | None), (TRecord _ | TMap | TAny) ->
                    loop subst env None rest
                | _, other -> Error [ map_type_mismatch other ])))
  in
  loop [] env (Some []) args

let infer_sequence callbacks env exprs =
  let rec loop subst env last = function
    | [] -> Ok (subst, apply_subst subst last)
    | expr :: rest -> (
        match callbacks.infer_expr env expr with
        | Error _ as error -> error
        | Ok (expr_subst, ty) ->
            let subst = compose_subst expr_subst subst in
            loop subst (apply_subst_env subst env) ty rest)
  in
  loop [] env TNil exprs

let infer_dissoc_result subst record_ty keys =
  match ensure_map_like subst record_ty with
  | Error _ as error -> error
  | Ok (subst, record_ty) -> (
      match record_ty with
      | TRecord fields -> (
          match record_labels_of_keys keys with
          | Some labels ->
              Ok (subst, TRecord (remove_record_fields labels fields))
          | None -> Ok (subst, TMap))
      | TMap | TAny -> Ok (subst, TMap)
      | other -> Error [ map_type_mismatch other ])

let infer_dissoc callbacks env = function
  | record :: keys -> (
      match callbacks.infer_expr env record with
      | Error _ as error -> error
      | Ok (record_subst, record_ty) -> (
          let env = apply_subst_env record_subst env in
          match infer_sequence callbacks env keys with
          | Error _ as error -> error
          | Ok (key_subst, _) ->
              let subst = compose_subst key_subst record_subst in
              infer_dissoc_result subst record_ty keys))
  | [] ->
      Error [ diagnostic "typecheck/arity" "dissoc expects a map and keys." ]

let infer_select_keys_result subst record_ty keys =
  match ensure_map_like subst record_ty with
  | Error _ as error -> error
  | Ok (subst, record_ty) -> (
      match record_ty with
      | TRecord fields -> (
          match record_labels_of_key_collection keys with
          | Some labels ->
              Ok (subst, TRecord (select_record_fields labels fields))
          | None -> Ok (subst, TMap))
      | TMap | TAny -> Ok (subst, TMap)
      | other -> Error [ map_type_mismatch other ])

let infer_select_keys callbacks env = function
  | [ record; keys ] -> (
      match callbacks.infer_expr env record with
      | Error _ as error -> error
      | Ok (record_subst, record_ty) -> (
          let env = apply_subst_env record_subst env in
          match callbacks.infer_expr env keys with
          | Error _ as error -> error
          | Ok (key_subst, _) ->
              let subst = compose_subst key_subst record_subst in
              infer_select_keys_result subst record_ty keys))
  | _ ->
      Error
        [
          diagnostic "typecheck/arity"
            "select-keys expects a map and list of keys.";
        ]

let infer_keys callbacks env = function
  | [ record ] -> (
      match callbacks.infer_expr env record with
      | Error _ as error -> error
      | Ok (subst, record_ty) -> (
          match ensure_map_like subst record_ty with
          | Error _ as error -> error
          | Ok (subst, record_ty) -> (
              match record_ty with
              | TRecord _ | TMap | TAny -> Ok (subst, TList TKeyword)
              | other -> Error [ map_type_mismatch other ])))
  | _ -> Error [ diagnostic "typecheck/arity" "keys expects one argument." ]

let record_values_item_type subst fields =
  match fields with
  | [] -> TAny
  | (_, first_ty) :: rest ->
      let first_ty = apply_subst subst first_ty in
      let rec loop = function
        | [] -> first_ty
        | (_, ty) :: rest -> (
            match unify first_ty (apply_subst subst ty) with
            | Ok _ -> loop rest
            | Error _ -> TAny)
      in
      loop rest

let infer_values callbacks env = function
  | [ record ] -> (
      match callbacks.infer_expr env record with
      | Error _ as error -> error
      | Ok (subst, record_ty) -> (
          match ensure_map_like subst record_ty with
          | Error _ as error -> error
          | Ok (subst, record_ty) -> (
              match record_ty with
              | TRecord fields ->
                  Ok (subst, TList (record_values_item_type subst fields))
              | TMap | TAny -> Ok (subst, TList TAny)
              | other -> Error [ map_type_mismatch other ])))
  | _ -> Error [ diagnostic "typecheck/arity" "values expects one argument." ]
