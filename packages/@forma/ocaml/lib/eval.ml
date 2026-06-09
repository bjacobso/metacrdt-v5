type value = Value.t =
  | VNil
  | VBool of bool
  | VInt of int
  | VFloat of float
  | VString of string
  | VSymbol of string
  | VKeyword of string
  | VList of value list
  | VVector of value list
  | VMap of (value * value) list
  | VClosure of closure
  | VMacro of closure

and closure = Value.closure = {
  params : string list;
  rest_param : string option;
  body : Ast.expr list;
  env : (string * value) list;
}

type diagnostic = Eval_common.diagnostic = {
  span : Ast.span option;
  code : string;
  message : string;
}

type env = Env.t

let string_json = Value.string_json
let diagnostic = Eval_common.diagnostic
let with_span = Eval_common.with_span

let eval_diagnostics_to_quote (diagnostics : diagnostic list) :
    Quote.diagnostic list =
  List.map
    (fun (eval_diagnostic : diagnostic) ->
      Quote.{ code = eval_diagnostic.code; message = eval_diagnostic.message })
    diagnostics

let eval_diagnostics_to_expand (diagnostics : diagnostic list) :
    Expand.diagnostic list =
  List.map
    (fun (eval_diagnostic : diagnostic) ->
      Expand.
        {
          span = eval_diagnostic.span;
          code = eval_diagnostic.code;
          message = eval_diagnostic.message;
        })
    diagnostics

let diagnostic_to_json diagnostic =
  match diagnostic.span with
  | Some span ->
      Diagnostic.to_json
        (Diagnostic.error ~span ~code:diagnostic.code
           ~message:diagnostic.message ())
  | None ->
      Printf.sprintf
        "{\"span\":null,\"severity\":\"error\",\"code\":%s,\"message\":%s,\"notes\":[],\"fixes\":[]}"
        (string_json diagnostic.code)
        (string_json diagnostic.message)

let value_to_json = Value.to_json

let rec eval_expr env expr =
  let result =
    match expr with
    | Reader.List (_, Reader.Symbol (_, ("perform" | "handle")) :: _) ->
        Eval_effect.eval (eval_effect_callbacks ()) env expr
    | Reader.Nil _ -> Ok VNil
    | Reader.Bool (_, value) -> Ok (VBool value)
    | Reader.Int (_, value) -> Ok (VInt value)
    | Reader.Float (_, value) -> Ok (VFloat value)
    | Reader.String (_, value) -> Ok (VString value)
    | Reader.Keyword (_, value) -> Ok (VKeyword value)
    | Reader.Vector (_, items) ->
        eval_all env items |> Result.map (fun values -> VVector values)
    | Reader.Map (_, entries) -> eval_map env entries
    | Reader.Symbol (_, symbol) -> eval_symbol env symbol
    | Reader.List (_, []) -> Ok (VList [])
    | Reader.List (_, Reader.Symbol (_, op) :: args) -> eval_form env op args
    | Reader.List (_, callee :: args) ->
        Eval_function.eval_application
          (eval_function_callbacks ())
          env callee args
  in
  Result.map_error (with_span (Ast.expr_span expr)) result

and eval_sequence env exprs =
  Eval_control.eval_sequence (eval_control_callbacks ()) env exprs

and eval_function_callbacks () =
  Eval_function.{ eval_expr; eval_all; eval_sequence; with_meta_lookup }

and eval_effect_pure env expr = eval_expr env expr

and eval_effect_callbacks () =
  Eval_effect.
    { eval_expr = eval_effect_pure; parse_params = Eval_function.parse_params }

and eval_control_callbacks () =
  Eval_control.
    {
      eval_expr;
      eval_expr_to_quote =
        (fun env expr ->
          eval_expr env expr |> Result.map_error eval_diagnostics_to_quote);
    }

and eval_symbol env symbol =
  match Env.lookup symbol env with
  | Some value -> Ok value
  | None ->
      Error
        [
          diagnostic "eval/unbound-symbol"
            (Printf.sprintf "Unbound symbol %S." symbol);
        ]

and eval_all env exprs =
  let rec loop acc = function
    | [] -> Ok (List.rev acc)
    | expr :: rest -> (
        match eval_expr env expr with
        | Error _ as error -> error
        | Ok value -> loop (value :: acc) rest)
  in
  loop [] exprs

and eval_map env entries =
  let rec loop acc = function
    | [] -> Ok (VMap (List.rev acc))
    | (key_expr, value_expr) :: rest -> (
        match (eval_expr env key_expr, eval_expr env value_expr) with
        | Ok key, Ok value -> loop ((key, value) :: acc) rest
        | Error diagnostics, _ | _, Error diagnostics -> Error diagnostics)
  in
  loop [] entries

and eval_form env op args =
  match op with
  | "quote" -> Eval_control.eval_quote args
  | "quasiquote" ->
      Eval_control.eval_quasiquote (eval_control_callbacks ()) env args
  | "unquote" ->
      Error
        [
          diagnostic "eval/unquote-outside-quasiquote"
            "unquote outside of quasiquote";
        ]
  | "do" -> Eval_control.eval_sequence (eval_control_callbacks ()) env args
  | "if" -> Eval_control.eval_if (eval_control_callbacks ()) env args
  | "when" -> Eval_control.eval_when (eval_control_callbacks ()) env args
  | "cond" -> Eval_control.eval_cond (eval_control_callbacks ()) env args
  | "match" -> Eval_control.eval_match (eval_control_callbacks ()) env args
  | "let" -> Eval_function.eval_let (eval_function_callbacks ()) env args
  | "fn" | "lambda" -> Eval_function.eval_lambda env args
  | "and" -> Eval_logic.eval_and (eval_logic_context ()) env args
  | "or" -> Eval_logic.eval_or (eval_logic_context ()) env args
  | "not" -> Eval_logic.eval_not (eval_logic_context ()) env args
  | "http/schema-decl" -> Eval_http.schema_decl (eval_http_context ()) env args
  | "http/error-decl" -> Eval_http.error_decl (eval_http_context ()) env args
  | "http/api-group-decl" ->
      Eval_http.api_group_decl (eval_http_context ()) env args
  | _ -> (
      match eval_syntax env op args with
      | Error _ as error -> error
      | Ok (Some value) -> Ok value
      | Ok None -> (
          match eval_domain env op args with
          | Error _ as error -> error
          | Ok (Some value) -> Ok value
          | Ok None -> (
              match eval_builtin env op args with
              | Error _ as error -> error
              | Ok (Some value) -> Ok value
              | Ok None -> (
                  match eval_symbol env op with
                  | Ok (VClosure closure) ->
                      Eval_function.apply_closure
                        (eval_function_callbacks ())
                        env closure args
                  | Ok (VMacro _) ->
                      Error
                        [
                          diagnostic "eval/unexpanded-macro"
                            (Printf.sprintf
                               "Macro %S reached evaluation before expansion."
                               op);
                        ]
                  | Ok descriptor when Descriptor.kind descriptor = Some "form"
                    ->
                      Ok (Descriptor.application_value op args)
                  | Ok _ ->
                      Error
                        [
                          diagnostic "eval/not-callable"
                            (Printf.sprintf "%S is not callable." op);
                        ]
                  | Error _ ->
                      Error
                        [
                          diagnostic "eval/unknown-builtin"
                            (Printf.sprintf "Unknown builtin %S." op);
                        ]))))

and with_meta_lookup env thunk =
  let outer_lookup = Eval_meta.current_lookup_declaration () in
  Eval_meta.with_lookup_declaration
    (match outer_lookup with
    | Some lookup ->
        Eval_meta_util.overlay_lookup_option lookup (fun name ->
            Env.lookup name env)
    | None -> fun name -> Env.lookup name env)
    thunk

and eval_builtin env op args =
  let builtin_context =
    Eval_builtin.
      {
        eval_expr;
        eval_all;
        apply_closure_values =
          Eval_function.apply_closure_values (eval_function_callbacks ());
      }
  in
  Eval_builtin.eval builtin_context env op args

and eval_required_builtin env op args =
  match eval_builtin env op args with
  | Error _ as error -> error
  | Ok (Some value) -> Ok value
  | Ok None ->
      Error
        [
          diagnostic "eval/unknown-builtin"
            (Printf.sprintf "Unknown builtin %S." op);
        ]

and eval_http_context () = Eval_http.{ eval_expr }

and eval_domain env op args =
  Eval_meta.eval
    Eval_meta.{ eval_expr; eval_all; eval_required_builtin }
    env op args

and eval_syntax env op args =
  Eval_syntax.eval Eval_syntax.{ eval_expr } env op args

and eval_logic_context () = Eval_logic.{ eval_expr }

let rec expand_program exprs =
  Eval_program.expand_program (eval_program_callbacks ()) exprs

and expand_program_with_env env exprs =
  Eval_program.expand_program_with_env (eval_program_callbacks ()) env exprs

and evaluate_program exprs =
  Eval_program.evaluate_program (eval_program_callbacks ()) exprs

and evaluate_program_with_env env exprs =
  Eval_program.evaluate_program_with_env (eval_program_callbacks ()) env exprs

and evaluate_effect_program_step env exprs =
  Eval_effect.eval_many_step (eval_effect_callbacks ()) env exprs

and apply_closure_values closure values =
  Eval_function.apply_closure_values (eval_function_callbacks ()) closure values

and apply_effect_closure_values_step closure values =
  Eval_effect.apply_closure_values_step (eval_effect_callbacks ()) closure
    values

and eval_toplevel env expr =
  Eval_toplevel.eval
    Eval_toplevel.{ eval_expr; parse_params = Eval_function.parse_params }
    env expr

and eval_program_callbacks () =
  Eval_program.
    {
      eval_sequence;
      eval_diagnostics_to_expand;
      eval_toplevel;
      with_meta_lookup;
      apply_closure_values =
        (fun closure values ->
          Eval_function.apply_closure_values
            (eval_function_callbacks ())
            closure values);
    }

let apply_named env name value =
  Eval_program.apply_named (eval_program_callbacks ()) env name value
