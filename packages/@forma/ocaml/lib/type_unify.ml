open Type_expr

let diagnostic = Type_diagnostic.make

let application_view = function
  | TList item -> Some (TNamed "List", [ item ])
  | TVector item -> Some (TNamed "Vector", [ item ])
  | TNamedApp (name, args) -> Some (TNamed name, args)
  | TApp (callee, args) -> Some (callee, args)
  | _ -> None

let is_finite_type_set = function
  | TNamed ("ErrorSet" | "RequirementSet") -> true
  | _ -> false

let sort_type_set_args args =
  List.sort
    (fun left right -> String.compare (ty_to_string left) (ty_to_string right))
    args

let bind_var id ty =
  match ty with
  | TVar other when other = id -> Ok []
  | _ when List.mem id (free_ty ty) ->
      Error
        [
          diagnostic "typecheck/occurs-check"
            (Printf.sprintf "Type variable %s occurs inside %s."
               (ty_to_diagnostic_string (TVar id))
               (ty_to_diagnostic_string ty));
        ]
  | _ -> Ok [ (id, ty) ]

let rec unify left right =
  match (left, right) with
  | TAny, _ | _, TAny -> Ok []
  | TVar id, ty | ty, TVar id -> bind_var id ty
  | TInt, TInt
  | TFloat, TFloat
  | TBool, TBool
  | TString, TString
  | TNil, TNil
  | TKeyword, TKeyword
  | TSymbol, TSymbol
  | TSyntax, TSyntax
  | TMap, TMap
  | TMacro, TMacro
  | TDeclaration, TDeclaration
  | TTypeValue, TTypeValue
  | TNamed _, TDeclaration
  | TDeclaration, TNamed _
  | TFormDescriptor, TFormDescriptor
  | TProtocolDescriptor, TProtocolDescriptor ->
      Ok []
  | TNamed left, TNamed right when left = right -> Ok []
  | TRecord _, TMap | TMap, TRecord _ -> Ok []
  | TRecord left, TRecord right ->
      let left = sort_record_fields left in
      let right = sort_record_fields right in
      let left_labels = List.map fst left in
      let right_labels = List.map fst right in
      if left_labels <> right_labels then
        Error
          [
            diagnostic "typecheck/record-shape"
              (Printf.sprintf "Expected record fields {%s} to match {%s}."
                 (String.concat ", " left_labels)
                 (String.concat ", " right_labels));
          ]
      else unify_many (List.map snd left) (List.map snd right)
  | TList left, TList right | TVector left, TVector right -> unify left right
  | TFn (left_args, left_result), TFn (right_args, right_result) ->
      if List.length left_args <> List.length right_args then
        Error
          [
            diagnostic "typecheck/arity"
              (Printf.sprintf "Function expects %d arguments, received %d."
                 (List.length left_args) (List.length right_args));
          ]
      else
        unify_many (left_args @ [ left_result ]) (right_args @ [ right_result ])
  | ( TVariadicFn (left_params, left_rest, left_result),
      TVariadicFn (right_params, right_rest, right_result) ) ->
      if List.length left_params <> List.length right_params then
        Error
          [
            diagnostic "typecheck/arity"
              (Printf.sprintf
                 "Function expects %d fixed arguments, received %d."
                 (List.length left_params) (List.length right_params));
          ]
      else
        unify_many
          (left_params @ [ left_rest; left_result ])
          (right_params @ [ right_rest; right_result ])
  | TVariadicFn (params, rest, result), TFn (args, fn_result)
  | TFn (args, fn_result), TVariadicFn (params, rest, result) ->
      if List.length args < List.length params then
        Error
          [
            diagnostic "typecheck/arity"
              (Printf.sprintf
                 "Function expects at least %d arguments, received %d."
                 (List.length params) (List.length args));
          ]
      else
        let extra_count = List.length args - List.length params in
        let expected_args = params @ List.init extra_count (fun _ -> rest) in
        unify_many (expected_args @ [ result ]) (args @ [ fn_result ])
  | _ -> (
      match (application_view left, application_view right) with
      | Some (left_callee, left_args), Some (right_callee, right_args) -> (
          match unify left_callee right_callee with
          | Error _ as error -> error
          | Ok callee_subst -> (
              let left_args = List.map (apply_subst callee_subst) left_args in
              let right_args = List.map (apply_subst callee_subst) right_args in
              let left_args, right_args =
                if is_finite_type_set left_callee && is_finite_type_set right_callee
                then (sort_type_set_args left_args, sort_type_set_args right_args)
                else (left_args, right_args)
              in
              match unify_many left_args right_args with
              | Error _ as error -> error
              | Ok arg_subst -> Ok (compose_subst arg_subst callee_subst)))
      | _ ->
          Error
            [
              diagnostic "typecheck/type-mismatch"
                (Printf.sprintf "Expected %s to match %s."
                   (ty_to_diagnostic_string left)
                   (ty_to_diagnostic_string right));
            ])

and unify_many left right =
  match (left, right) with
  | [], [] -> Ok []
  | left :: left_rest, right :: right_rest -> (
      match unify left right with
      | Error _ as error -> error
      | Ok subst -> (
          let left_rest = List.map (apply_subst subst) left_rest in
          let right_rest = List.map (apply_subst subst) right_rest in
          match unify_many left_rest right_rest with
          | Error _ as error -> error
          | Ok rest_subst -> Ok (compose_subst rest_subst subst)))
  | _ -> Error [ diagnostic "typecheck/arity" "Arity mismatch." ]

let unify_with_span span left right =
  match unify left right with
  | Ok _ as ok -> ok
  | Error diagnostics -> Error (Type_diagnostic.with_span span diagnostics)
