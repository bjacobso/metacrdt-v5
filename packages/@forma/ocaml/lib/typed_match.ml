type diagnostic = Type_diagnostic.t

open Type_expr
open Type_env
open Type_unify

type env = Type_env.env

type callbacks = {
  infer_expr : env -> Core_ast.expr -> (subst * ty, diagnostic list) result;
}

let diagnostic = Type_diagnostic.make

let rec infer_match callbacks env scrutinee arms =
  match callbacks.infer_expr env scrutinee with
  | Error _ as error -> error
  | Ok (scrutinee_subst, scrutinee_ty) -> (
      let env = apply_subst_env scrutinee_subst env in
      let scrutinee_ty = apply_subst scrutinee_subst scrutinee_ty in
      match infer_match_arms callbacks env scrutinee_ty arms with
      | Error _ as error -> error
      | Ok (arm_subst, ty) -> Ok (compose_subst arm_subst scrutinee_subst, ty))

and infer_match_arms callbacks env scrutinee_ty arms =
  match arms with
  | [] -> Ok ([], TNil)
  | [ arm ] -> infer_match_arm callbacks env scrutinee_ty arm
  | arm :: rest -> (
      match infer_match_arm callbacks env scrutinee_ty arm with
      | Error _ as error -> error
      | Ok (arm_subst, arm_ty) -> (
          let env = apply_subst_env arm_subst env in
          let scrutinee_ty = apply_subst arm_subst scrutinee_ty in
          match infer_match_arms callbacks env scrutinee_ty rest with
          | Error _ as error -> error
          | Ok (rest_subst, rest_ty) -> (
              let subst = compose_subst rest_subst arm_subst in
              let arm_ty = apply_subst subst arm_ty in
              let rest_ty = apply_subst subst rest_ty in
              let arm_effect = effect_parts arm_ty in
              let rest_effect = effect_parts rest_ty in
              match (arm_effect, rest_effect) with
              | None, None -> (
                  match unify rest_ty arm_ty with
                  | Ok unify_subst ->
                      let subst = compose_subst unify_subst subst in
                      Ok (subst, apply_subst subst arm_ty)
                  | Error _ as error -> error)
              | _ -> (
                  let arm_success, arm_errors, arm_req =
                    match arm_effect with
                    | Some parts -> parts
                    | None -> (arm_ty, [], [])
                  in
                  let rest_success, rest_errors, rest_req =
                    match rest_effect with
                    | Some parts -> parts
                    | None -> (rest_ty, [], [])
                  in
                  match unify arm_success rest_success with
                  | Ok unify_subst ->
                      let subst = compose_subst unify_subst subst in
                      Ok
                        ( subst,
                          effect_type
                            (apply_subst subst arm_success)
                            (merge_type_sets arm_errors rest_errors)
                            (merge_type_sets arm_req rest_req) )
                  | Error _ as error -> error))))

and infer_match_arm callbacks env scrutinee_ty arm =
  match infer_pattern env scrutinee_ty arm.Core_ast.pattern with
  | Error _ as error -> error
  | Ok (pattern_subst, pattern_env) -> (
      let env = pattern_env @ apply_subst_env pattern_subst env in
      match callbacks.infer_expr env arm.body with
      | Error _ as error -> error
      | Ok (body_subst, body_ty) ->
          Ok (compose_subst body_subst pattern_subst, body_ty))

and infer_pattern env scrutinee_ty = function
  | Core_ast.PWild -> Ok ([], [])
  | Core_ast.PCon (name, vars) -> (
      match Type_env.lookup name env with
      | Some (TFn (param_tys, result_ty)) -> (
          if List.length vars <> List.length param_tys then
            Error
              [
                diagnostic "typecheck/pattern-arity"
                  (Printf.sprintf
                     "Constructor %S expects %d pattern arguments, received %d."
                     name (List.length param_tys) (List.length vars));
              ]
          else
            match unify result_ty scrutinee_ty with
            | Error _ as error -> error
            | Ok subst ->
                let bindings =
                  List.map2
                    (fun var ty ->
                      (var, Forall ([], apply_subst subst ty, [], Plain)))
                    vars param_tys
                in
                Ok (subst, bindings))
      | Some ty -> (
          if vars <> [] then
            Error
              [
                diagnostic "typecheck/pattern-arity"
                  (Printf.sprintf
                     "Constructor %S expects 0 pattern arguments, received %d."
                     name (List.length vars));
              ]
          else
            match unify ty scrutinee_ty with
            | Error _ as error -> error
            | Ok subst -> Ok (subst, []))
      | None -> Ok ([], pattern_bindings (Core_ast.PCon (name, vars))))

and pattern_bindings = function
  | Core_ast.PWild -> []
  | Core_ast.PCon (_, vars) ->
      List.map (fun name -> (name, Forall ([], TAny, [], Plain))) vars

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
