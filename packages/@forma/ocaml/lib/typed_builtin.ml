type diagnostic = Type_diagnostic.t

open Type_expr
open Type_env
open Type_unify

type env = Type_env.env

type callbacks = {
  infer_expr : env -> Core_ast.expr -> (subst * ty, diagnostic list) result;
  infer_apply :
    env ->
    subst ->
    ty ->
    Core_ast.expr list ->
    (subst * ty, diagnostic list) result;
}

let diagnostic = Type_diagnostic.make
let env_lookup = Type_env.lookup

let unary_list_type result_builder =
  let item_ty = fresh_tyvar () in
  TFn ([ TList item_ty ], result_builder item_ty)

let map_type () =
  let item_ty = fresh_tyvar () in
  let result_ty = fresh_tyvar () in
  TFn ([ TFn ([ item_ty ], result_ty); TList item_ty ], TList result_ty)

let filter_type () =
  let item_ty = fresh_tyvar () in
  TFn ([ TFn ([ item_ty ], TAny); TList item_ty ], TList item_ty)

let flat_map_type () =
  let item_ty = fresh_tyvar () in
  let result_ty = fresh_tyvar () in
  TFn ([ TFn ([ item_ty ], TList result_ty); TList item_ty ], TList result_ty)

let nth_type () =
  let item_ty = fresh_tyvar () in
  TFn ([ TList item_ty; TInt ], item_ty)

let builtin_value_type = function
  | "map" | "list/map" -> Some (map_type ())
  | "filter" | "list/filter" -> Some (filter_type ())
  | "flat-map" | "list/flat-map" -> Some (flat_map_type ())
  | "count" -> Some (unary_list_type (fun _ -> TInt))
  | "first" -> Some (unary_list_type Fun.id)
  | "rest" -> Some (unary_list_type (fun item_ty -> TList item_ty))
  | "nth" -> Some (nth_type ())
  | _ -> None

let typed_record_callbacks (callbacks : callbacks) :
    Typed_record_builtin.callbacks =
  Typed_record_builtin.{ infer_expr = callbacks.infer_expr }

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

let infer_unary callbacks env expected result = function
  | [ expr ] -> (
      match callbacks.infer_expr env expr with
      | Error _ as error -> error
      | Ok (subst, ty) -> (
          match unify (apply_subst subst ty) expected with
          | Error _ as error -> error
          | Ok unify_subst -> Ok (compose_subst unify_subst subst, result)))
  | _ -> Error [ diagnostic "typecheck/arity" "Expected one argument." ]

let infer_args_return callbacks env args result =
  match infer_sequence callbacks env args with
  | Error _ as error -> error
  | Ok (subst, _) -> Ok (subst, result)

let infer_numeric callbacks env op args =
  let rec loop subst env saw_float = function
    | [] -> Ok (subst, if op = "/" || saw_float then TFloat else TInt)
    | expr :: rest -> (
        match callbacks.infer_expr env expr with
        | Error _ as error -> error
        | Ok (expr_subst, ty) -> (
            let subst = compose_subst expr_subst subst in
            let ty = apply_subst subst ty in
            let numeric_ty = match ty with TFloat -> TFloat | _ -> TInt in
            match unify ty numeric_ty with
            | Error _ as error -> error
            | Ok unify_subst ->
                let subst = compose_subst unify_subst subst in
                loop subst
                  (apply_subst_env subst env)
                  (saw_float || numeric_ty = TFloat)
                  rest))
  in
  loop [] env false args

let infer_comparison callbacks env op args =
  match args with
  | [ left; right ] -> (
      match infer_numeric callbacks env op [ left; right ] with
      | Error _ as error -> error
      | Ok (subst, _) -> Ok (subst, TBool))
  | _ ->
      Error
        [
          diagnostic "typecheck/arity"
            (Printf.sprintf "%s expects exactly two arguments." op);
        ]

let infer_equality callbacks env = function
  | [ left; right ] -> (
      match (callbacks.infer_expr env left, callbacks.infer_expr env right) with
      | Error diagnostics, _ | _, Error diagnostics -> Error diagnostics
      | Ok (left_subst, left_ty), Ok (right_subst, right_ty) -> (
          let subst = compose_subst right_subst left_subst in
          match
            unify (apply_subst subst left_ty) (apply_subst subst right_ty)
          with
          | Error _ as error -> error
          | Ok unify_subst -> Ok (compose_subst unify_subst subst, TBool)))
  | _ ->
      Error [ diagnostic "typecheck/arity" "= expects exactly two arguments." ]

let infer_builtin_application callbacks env op args =
  match op with
  | "quote" | "quasiquote" -> Ok ([], TSyntax)
  | "and" | "or" -> infer_args_return callbacks env args TAny
  | "not" -> infer_unary callbacks env TAny TBool args
  | "__vector" ->
      Typed_collection_builtin.infer_collection
        Typed_collection_builtin.{ infer_expr = callbacks.infer_expr }
        env
        (fun ty -> TVector ty)
        args
  | "+" | "-" | "*" | "/" | "mod" -> infer_numeric callbacks env op args
  | "=" | "!=" -> infer_equality callbacks env args
  | "<" | "<=" | ">" | ">=" -> infer_comparison callbacks env op args
  | "list" ->
      Typed_collection_builtin.infer_collection
        Typed_collection_builtin.{ infer_expr = callbacks.infer_expr }
        env
        (fun ty -> TList ty)
        args
  | "str" | "format" -> infer_args_return callbacks env args TString
  | "count" ->
      Typed_collection_builtin.infer_count
        Typed_collection_builtin.{ infer_expr = callbacks.infer_expr }
        env args
  | "first" ->
      Typed_collection_builtin.infer_first
        Typed_collection_builtin.{ infer_expr = callbacks.infer_expr }
        env args
  | "nth" ->
      Typed_collection_builtin.infer_nth
        Typed_collection_builtin.{ infer_expr = callbacks.infer_expr }
        env args
  | "rest" ->
      Typed_collection_builtin.infer_rest
        Typed_collection_builtin.{ infer_expr = callbacks.infer_expr }
        env args
  | "map" | "list/map" ->
      Typed_collection_builtin.infer_map
        Typed_collection_builtin.{ infer_expr = callbacks.infer_expr }
        env op args
  | "filter" | "list/filter" ->
      Typed_collection_builtin.infer_filter
        Typed_collection_builtin.{ infer_expr = callbacks.infer_expr }
        env op args
  | "append" ->
      Typed_collection_builtin.infer_append
        Typed_collection_builtin.{ infer_expr = callbacks.infer_expr }
        env args
  | "concat" ->
      Typed_collection_builtin.infer_concat
        Typed_collection_builtin.{ infer_expr = callbacks.infer_expr }
        env args
  | "flat-map" | "list/flat-map" ->
      Typed_collection_builtin.infer_flat_map
        Typed_collection_builtin.{ infer_expr = callbacks.infer_expr }
        env op args
  | "reduce" | "list/reduce" ->
      Typed_collection_builtin.infer_reduce
        Typed_collection_builtin.{ infer_expr = callbacks.infer_expr }
        env args
  | "into" -> infer_args_return callbacks env args TMap
  | "get" | "path" -> infer_args_return callbacks env args TAny
  | "get-in" ->
      Typed_record_builtin.infer_get_in
        (typed_record_callbacks callbacks)
        env args
  | "assoc" ->
      Typed_record_builtin.infer_assoc
        (typed_record_callbacks callbacks)
        env args
  | "merge" ->
      Typed_record_builtin.infer_merge
        (typed_record_callbacks callbacks)
        env args
  | "dissoc" ->
      Typed_record_builtin.infer_dissoc
        (typed_record_callbacks callbacks)
        env args
  | "select-keys" ->
      Typed_record_builtin.infer_select_keys
        (typed_record_callbacks callbacks)
        env args
  | "keys" ->
      Typed_record_builtin.infer_keys
        (typed_record_callbacks callbacks)
        env args
  | "values" | "vals" ->
      Typed_record_builtin.infer_values
        (typed_record_callbacks callbacks)
        env args
  | "conj" ->
      Typed_collection_builtin.infer_conj
        Typed_collection_builtin.{ infer_expr = callbacks.infer_expr }
        env args
  | "empty?" | "contains?" | "set/contains?" | "nil?" | "string?" | "number?"
  | "boolean?" | "list?" | "map?" | "fn?" ->
      infer_args_return callbacks env args TBool
  | "gensym" -> infer_args_return callbacks env args TSymbol
  | "sexpr-sym-name" -> infer_args_return callbacks env args TString
  | "sexpr-list?" -> infer_args_return callbacks env args TBool
  | "sexpr-items" -> infer_args_return callbacks env args (TList TAny)
  | "meta/declaration-name" | "meta/form-name" | "meta/declaration-kind"
  | "meta/slot-symbol" | "meta/slot-string" ->
      infer_args_return callbacks env args TString
  | "meta/slot-string-list" | "meta/slot-values" | "meta/declaration-fields"
  | "diag/concat" | "diag/require-slot" | "diag/member-of" | "diag/one-of" ->
      infer_args_return callbacks env args (TList TAny)
  | "meta/semantic-env" | "meta/declaration-field" | "meta/slot-value"
  | "meta/slot-expr" | "meta/slot-runtime-expr" | "meta/slot-ref" | "meta/loc"
  | "meta/identifier" | "meta/positional-arg" | "meta/positional-scalar" ->
      infer_args_return callbacks env args TAny
  | "meta/descriptor" -> infer_args_return callbacks env args TFormDescriptor
  | "meta/descriptor-extension" -> infer_args_return callbacks env args TMap
  | "meta/lookup-declaration" | "meta/normalized-form" ->
      infer_args_return callbacks env args TDeclaration
  | "meta/child-forms" -> infer_args_return callbacks env args (TList TAny)
  | "meta/expr-assignable-to?" -> infer_args_return callbacks env args TBool
  | "meta/check-expr" | "meta/infer-expr-type" ->
      infer_args_return callbacks env args TTypeValue
  | "bindings/empty" | "bindings/of" | "bindings/merge" | "bindings/when"
  | "bindings/from-declaration" | "bindings/from-fields" | "bindings/scoped"
  | "diag/error" | "construct/object" | "construct/declaration"
  | "construct/summary" | "construct/assoc" | "construct/from-descriptor" ->
      infer_args_return callbacks env args TMap
  | "meta/declaration-type" | "meta/project-type" | "type/unknown"
  | "type/constant" | "type/list" | "type/vector" | "type/ref" | "type/record"
  | "type/project-row" ->
      infer_args_return callbacks env args TTypeValue
  | _ ->
      Error
        [
          diagnostic "typecheck/unknown-form"
            (Printf.sprintf "Unknown form or function %S." op);
        ]

let infer_named_application callbacks env name args =
  match env_lookup name env with
  | Some TFormDescriptor -> Ok ([], TDeclaration)
  | Some TMacro -> infer_args_return callbacks env args TAny
  | Some ty -> callbacks.infer_apply env [] ty args
  | None when Type_env.builtins_enabled env ->
      infer_builtin_application callbacks env name args
  | None ->
      Error
        [
          diagnostic "typecheck/unknown-form"
            (Printf.sprintf "Unknown form or function %S." name);
        ]
