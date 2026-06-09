open Type_expr
open Type_env
open Type_unify

type expression_type = Typed_toplevel.expression_type = {
  form_index : int;
  span : Ast.span;
  typ : Type_expr.ty;
}

let rec infer_expr env expr =
  let result =
    match expr with
    | Core_ast.Lit (_, Core_ast.LNil) -> Ok ([], TNil)
    | Core_ast.Lit (_, Core_ast.LBool _) -> Ok ([], TBool)
    | Core_ast.Lit (_, Core_ast.LInt _) -> Ok ([], TInt)
    | Core_ast.Lit (_, Core_ast.LFloat _) -> Ok ([], TFloat)
    | Core_ast.Lit (_, Core_ast.LString _) -> Ok ([], TString)
    | Core_ast.Lit (_, Core_ast.LKeyword _) -> Ok ([], TString)
    | Core_ast.Var (node, symbol) -> (
        match Type_env.lookup_scheme symbol env with
        | Some scheme ->
            let ty, _ =
              Type_env.instantiate_with_subst_at node.Core_ast.span scheme
            in
            Ok ([], ty)
        | None -> (
            match
              if Type_env.builtins_enabled env then
                Typed_builtin.builtin_value_type symbol
              else None
            with
            | Some ty -> Ok ([], ty)
            | None ->
                Error
                  [
                    Type_diagnostic.make "typecheck/unbound-symbol"
                      (Printf.sprintf "Unbound symbol %S." symbol);
                  ]))
    | Core_ast.Record (_, fields) ->
        Typed_record_builtin.infer_record
          Typed_record_builtin.{ infer_expr }
          env fields
    | Core_ast.Get (_, record, label) -> (
        match infer_expr env record with
        | Error _ as error -> error
        | Ok (subst, record_ty) ->
            Typed_record_builtin.infer_get_field subst record_ty label)
    | Core_ast.Lam (_, params, rest_param, body) ->
        infer_lambda env params rest_param body
    | Core_ast.App (_, Core_ast.Var (_, "succeed"), args) ->
        infer_operational_succeed env args
    | Core_ast.App (node, Core_ast.Var (_, "fail"), args) ->
        infer_operational_fail env node.Core_ast.span args
    | Core_ast.App (node, Core_ast.Var (_, op), args) ->
        infer_typeclass_named_application env node.Core_ast.span op args
    | Core_ast.App (_, callee, args) ->
        Typed_apply.infer_application Typed_apply.{ infer_expr } env callee args
    | Core_ast.Let (_, bindings, body) -> infer_let env bindings body
    | Core_ast.EffectDo (_, bindings, body) -> infer_effect_do env bindings body
    | Core_ast.If (_, condition, consequent, alternate) ->
        infer_if env condition consequent alternate
    | Core_ast.Def (_, name, signature, value) ->
        infer_definition env name signature value
    | Core_ast.Ascribe (_, value, type_expr) ->
        infer_ascription env value type_expr
    | Core_ast.Match (_, scrutinee, arms) ->
        Typed_match.infer_match Typed_match.{ infer_expr } env scrutinee arms
    | Core_ast.TypeDef _ -> Ok ([], TDeclaration)
    | Core_ast.DslForm _ -> Ok ([], TDeclaration)
  in
  Result.map_error (Type_diagnostic.with_span (Core_ast.expr_span expr)) result

and infer_typeclass_named_application env span op args =
  match Type_env.lookup_scheme op env with
  | Some
      (Type_env.Forall
         (_, (TMacro | TFormDescriptor | TProtocolDescriptor), _, _)) ->
      Typed_builtin.infer_named_application
        Typed_builtin.
          {
            infer_expr;
            infer_apply = Typed_apply.infer_apply Typed_apply.{ infer_expr };
          }
        env op args
  | Some scheme -> (
      let callee_span =
        {
          span with
          start_offset = span.start_offset + 1;
          end_offset = span.start_offset + 1 + String.length op;
        }
      in
      let callee_ty, _ =
        Type_env.instantiate_with_subst_at callee_span scheme
      in
      match
        Typed_apply.infer_apply Typed_apply.{ infer_expr } env [] callee_ty args
      with
      | Error _ as error -> error
      | Ok (subst, ty) -> Type_env.discharge_and_return env subst (subst, ty))
  | _ when Type_env.builtins_enabled env ->
      Typed_builtin.infer_named_application
        Typed_builtin.
          {
            infer_expr;
            infer_apply = Typed_apply.infer_apply Typed_apply.{ infer_expr };
          }
        env op args
  | _ ->
      Error
        [
          Type_diagnostic.make ~span "typecheck/unknown-form"
            (Printf.sprintf "Unknown form or function %S." op);
        ]

and infer_if env condition consequent alternate =
  match infer_expr env condition with
  | Error _ as error -> error
  | Ok (condition_subst, _) -> (
      let env = apply_subst_env condition_subst env in
      match infer_expr env consequent with
      | Error _ as error -> error
      | Ok (consequent_subst, consequent_ty) -> (
          let subst = compose_subst consequent_subst condition_subst in
          let env = apply_subst_env subst env in
          match alternate with
          | Core_ast.Lit (_, Core_ast.LNil) ->
              Ok (subst, apply_subst subst consequent_ty)
          | _ -> (
              match infer_expr env alternate with
              | Error _ as error -> error
              | Ok (alternate_subst, alternate_ty) -> (
                  let subst = compose_subst alternate_subst subst in
                  let consequent_ty = apply_subst subst consequent_ty in
                  let alternate_ty = apply_subst subst alternate_ty in
                  match consequent with
                  | Core_ast.Lit (_, Core_ast.LNil) ->
                      Ok (subst, apply_subst subst alternate_ty)
                  | _ ->
                  let consequent_effect = effect_parts consequent_ty in
                  let alternate_effect = effect_parts alternate_ty in
                  match (consequent_effect, alternate_effect) with
                  | None, None -> (
                      match unify consequent_ty alternate_ty with
                      | Error _ as error -> error
                      | Ok unify_subst ->
                          let subst = compose_subst unify_subst subst in
                          Ok (subst, apply_subst subst consequent_ty))
                  | _ -> (
                      let consequent_success, consequent_errors, consequent_req =
                        match consequent_effect with
                        | Some parts -> parts
                        | None -> (consequent_ty, [], [])
                      in
                      let alternate_success, alternate_errors, alternate_req =
                        match alternate_effect with
                        | Some parts -> parts
                        | None -> (alternate_ty, [], [])
                      in
                      match unify consequent_success alternate_success with
                      | Error _ as error -> error
                      | Ok unify_subst ->
                          let subst = compose_subst unify_subst subst in
                          Ok
                            ( subst,
                              effect_type
                                (apply_subst subst consequent_success)
                                (merge_type_sets consequent_errors
                                   alternate_errors)
                                (merge_type_sets consequent_req alternate_req)
                            ))))))

and infer_let env bindings body =
  match infer_let_bindings env bindings with
  | Error _ as error -> error
  | Ok (subst, env) -> (
      match infer_expr env body with
      | Error _ as error -> error
      | Ok (body_subst, ty) -> Ok (compose_subst body_subst subst, ty))

and infer_let_bindings env bindings =
  let rec loop subst env = function
    | [] -> Ok (subst, env)
    | (binding : Core_ast.binding) :: rest -> (
        let pending_start = Type_env.pending_constraints_count () in
        match infer_expr env binding.Core_ast.expr with
        | Error _ as error -> error
        | Ok (value_subst, value_ty) ->
            let subst = compose_subst value_subst subst in
            let env = apply_subst_env subst env in
            let scheme =
              generalize_binding env (apply_subst subst value_ty) pending_start
            in
            loop subst (Type_env.bind binding.name scheme env) rest)
  in
  loop [] env bindings

and effect_set_items set_name = function
  | TNamedApp (name, items) when name = set_name -> Some items
  | TApp (TNamed name, items) when name = set_name -> Some items
  | _ -> None

and effect_parts = function
  | TNamedApp ("Effect", [ success; errors; requirements ])
  | TApp (TNamed "Effect", [ success; errors; requirements ]) -> (
      match
        ( effect_set_items "ErrorSet" errors,
          effect_set_items "RequirementSet" requirements )
      with
      | Some errors, Some requirements -> Some (success, errors, requirements)
      | _ -> None)
  | _ -> None

and merge_type_sets left right =
  let rec loop seen acc = function
    | [] -> List.rev acc
    | ty :: rest ->
        let key = ty_to_string ty in
        if List.mem key seen then loop seen acc rest
        else loop (key :: seen) (ty :: acc) rest
  in
  loop [] [] (left @ right)

and effect_type success errors requirements =
  TNamedApp
    ( "Effect",
      [
        success;
        TNamedApp ("ErrorSet", errors);
        TNamedApp ("RequirementSet", requirements);
      ] )

and infer_operational_succeed env = function
  | [ value ] -> (
      match infer_expr env value with
      | Error _ as error -> error
      | Ok (subst, value_ty) ->
          Ok (subst, effect_type (apply_subst subst value_ty) [] []))
  | _ ->
      Error
        [
          Type_diagnostic.make "typecheck/effect-succeed"
            "succeed expects exactly one value.";
        ]

and infer_operational_fail _env span = function
  | [ Core_ast.Var (_, error_name) ] ->
      Ok ([], effect_type (fresh_tyvar ()) [ TNamed error_name ] [])
  | _ ->
      Error
        [
          Type_diagnostic.make ~span "typecheck/effect-fail"
            "fail expects exactly one error type name.";
        ]

and infer_effect_do env bindings body =
  let rec loop subst env errors requirements = function
    | [] -> (
        match infer_expr env body with
        | Error _ as error -> error
        | Ok (body_subst, body_ty) ->
            let subst = compose_subst body_subst subst in
            let body_ty = apply_subst subst body_ty in
            let success, errors, requirements =
              match effect_parts body_ty with
              | Some (success, body_errors, body_requirements) ->
                  ( success,
                    merge_type_sets errors body_errors,
                    merge_type_sets requirements body_requirements )
              | None -> (body_ty, errors, requirements)
            in
            Ok (subst, effect_type success errors requirements))
    | (binding : Core_ast.binding) :: rest -> (
        match infer_expr env binding.expr with
        | Error _ as error -> error
        | Ok (binding_subst, binding_ty) -> (
            let subst = compose_subst binding_subst subst in
            let binding_ty = apply_subst subst binding_ty in
            match effect_parts binding_ty with
            | None ->
                Error
                  [
                    Type_diagnostic.make ~span:binding.node.span
                      "typecheck/effect-bind"
                      (Printf.sprintf "Effect bind expects Effect, received %s."
                         (ty_to_string binding_ty));
                  ]
            | Some (success, binding_errors, binding_requirements) ->
                loop subst
                  (Type_env.bind binding.name (Forall ([], success, [], Plain))
                     (apply_subst_env subst env))
                  (merge_type_sets errors binding_errors)
                  (merge_type_sets requirements binding_requirements)
                  rest))
  in
  loop [] env [] [] bindings

and infer_lambda env params rest_param body =
  let param_tys = List.map (fun _ -> fresh_tyvar ()) params in
  let param_bindings =
    List.map2
      (fun (param : Core_ast.param) ty ->
        (param.name, Forall ([], ty, [], Plain)))
      params param_tys
  in
  let rest_binding =
    match rest_param with
    | None -> []
    | Some (param : Core_ast.param) ->
        [ (param.name, Forall ([], TList TAny, [], Plain)) ]
  in
  let local_env = rest_binding @ param_bindings @ env in
  match infer_expr local_env body with
  | Error _ as error -> error
  | Ok (body_subst, body_ty) ->
      Ok
        ( body_subst,
          TFn
            ( List.map (apply_subst body_subst) param_tys,
              apply_subst body_subst body_ty ) )

and infer_definition env _name signature value =
  match infer_expr env value with
  | Error _ as error -> error
  | Ok (value_subst, value_ty) -> (
      let subst = value_subst in
      let env = apply_subst_env subst env in
      let inferred_ty = apply_subst subst value_ty in
      let checked_ty =
        match signature with
        | None -> Ok (subst, inferred_ty)
        | Some signature -> (
            match Type_resolve.resolve env signature with
            | Error _ as error -> error
            | Ok expected -> (
                match unify inferred_ty expected with
                | Error _ as error -> error
                | Ok signature_subst ->
                    let subst = compose_subst signature_subst subst in
                    Ok (subst, apply_subst subst expected)))
      in
      match checked_ty with
      | Error _ as error -> error
      | Ok (subst, ty) -> Ok (subst, ty))

and infer_ascription env value type_expr =
  match (infer_expr env value, Type_resolve.resolve env type_expr) with
  | Error diagnostics, _ | _, Error diagnostics -> Error diagnostics
  | Ok (subst, actual), Ok expected -> (
      match unify (apply_subst subst actual) expected with
      | Error _ as error -> error
      | Ok ascription_subst ->
          let subst = compose_subst ascription_subst subst in
          Ok (subst, apply_subst subst expected))

let typed_analysis_callbacks =
  Typed_analysis.{ infer_expr; pattern_bindings = Typed_match.pattern_bindings }

let infer_toplevel_core env expr =
  Typed_analysis.infer_toplevel_core typed_analysis_callbacks env expr

let annotate_expr env expr =
  Typed_analysis.annotate_expr typed_analysis_callbacks env expr

let infer_core_expr env expr =
  Type_env.with_pending_reset (fun () ->
      match infer_expr env expr with
      | Error _ as error -> error
      | Ok (subst, ty) -> Type_env.discharge_and_apply env subst ty)

let typecheck_core_program_typed_with_descriptor_infer
    (descriptor_hooks : Descriptor_protocol.descriptor_hooks) env program =
  Typed_program.typecheck_with_descriptor_hooks
    { infer_toplevel_core; annotate_expr }
    descriptor_hooks env program

let typecheck_program_with_env env exprs =
  Type_env.with_pending_reset (fun () ->
      Typed_toplevel.typecheck_program_with_env
        Typed_toplevel.{ infer_toplevel_core; infer_core_expr }
        env exprs)

let typecheck_program_with_env_all env exprs =
  Type_env.with_pending_reset (fun () ->
      Typed_toplevel.typecheck_program_with_env_all
        Typed_toplevel.{ infer_toplevel_core; infer_core_expr }
        env exprs)
