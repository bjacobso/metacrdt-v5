let warning_json span message =
  Printf.sprintf
    "{\"span\":{\"sourceId\":%s,\"startOffset\":%d,\"endOffset\":%d},\"severity\":\"warning\",\"message\":%s,\"notes\":[],\"fixes\":[]}"
    (Value.string_json span.Ast.source_id)
    span.start_offset span.end_offset
    (Value.string_json message)

let is_whitespace = function ' ' | '\n' | '\r' | '\t' -> true | _ -> false

let preprocess_effect_type_source source =
  let bytes = Bytes.of_string source in
  let len = Bytes.length bytes in
  let rec skip_ws i =
    if i < len && is_whitespace (Bytes.get bytes i) then skip_ws (i + 1) else i
  in
  let rec find_matching_brace depth i =
    if i >= len then None
    else
      match Bytes.get bytes i with
      | '{' -> find_matching_brace (depth + 1) (i + 1)
      | '}' ->
          if depth = 1 then Some i else find_matching_brace (depth - 1) (i + 1)
      | _ -> find_matching_brace depth (i + 1)
  in
  let rec loop i =
    if i + 2 >= len then ()
    else if
      Bytes.get bytes i = '-'
      && Bytes.get bytes (i + 1) = '>'
      && Bytes.get bytes (i + 2) = '!'
    then (
      Bytes.set bytes (i + 2) ' ';
      let effect_start = skip_ws (i + 3) in
      if effect_start < len && Bytes.get bytes effect_start = '{' then
        match find_matching_brace 1 (effect_start + 1) with
        | Some effect_end ->
            for index = effect_start to effect_end do
              Bytes.set bytes index ' '
            done;
            loop (effect_end + 1)
        | None -> ()
      else loop (i + 3))
    else loop (i + 1)
  in
  loop 0;
  Bytes.to_string bytes

type effect_registry = {
  effect_names : string list;
  operations : (string * string) list;
  env : Type_env.env;
}

let registry_env registry = registry.env
let empty_effect_registry env = { effect_names = []; operations = []; env }

let effect_operation_effect registry op_name =
  List.assoc_opt op_name registry.operations

let parse_effect_operation env effect_name = function
  | Ast.List
      (_, [ Ast.Symbol (_, "op"); Ast.Symbol (_, op_name); type_expr_ast ]) -> (
      match Lower_type.parse_type_expr type_expr_ast with
      | Error diagnostics ->
          Error
            (List.map
               (fun (diagnostic : Lower_common.diagnostic) ->
                 Type_diagnostic.make ?span:diagnostic.span diagnostic.code
                   diagnostic.message)
               diagnostics)
      | Ok type_expr -> (
          match Type_resolve.resolve env type_expr with
          | Error _ as error -> error
          | Ok ty ->
              Ok
                ( op_name,
                  Type_env.Forall ([], ty, [], Type_env.Plain),
                  (op_name, effect_name) )))
  | bad ->
      Error
        [
          Type_diagnostic.make ~span:(Ast.expr_span bad)
            "typecheck/define-effect"
            "define-effect operations must be (op name type).";
        ]

let collect_effect_registry base_env exprs =
  let rec collect registry = function
    | [] -> Ok registry
    | Ast.List
        ( _,
          Ast.Symbol (_, "define-effect") :: Ast.Symbol (_, effect_name) :: ops
        )
      :: rest -> (
        let rec collect_ops env op_bindings op_pairs = function
          | [] -> Ok (env, List.rev op_bindings, List.rev op_pairs)
          | op_expr :: more -> (
              match parse_effect_operation env effect_name op_expr with
              | Error _ as error -> error
              | Ok (op_name, scheme, op_pair) ->
                  let env = Type_env.bind op_name scheme env in
                  collect_ops env
                    ((op_name, scheme) :: op_bindings)
                    (op_pair :: op_pairs) more)
        in
        match collect_ops registry.env [] [] ops with
        | Error _ as error -> error
        | Ok (env, _op_bindings, op_pairs) ->
            collect
              {
                effect_names =
                  effect_name
                  :: List.filter
                       (fun name -> name <> effect_name)
                       registry.effect_names;
                operations = op_pairs @ registry.operations;
                env;
              }
              rest)
    | _ :: rest -> collect registry rest
  in
  collect (empty_effect_registry base_env) exprs

let sorted_uniq_strings values = List.sort_uniq String.compare values
let union_effects left right = sorted_uniq_strings (left @ right)

let subtract_effects present handled =
  present
  |> List.filter (fun effect_name -> not (List.mem effect_name handled))
  |> sorted_uniq_strings

let rec effect_names_of_expr = function
  | Ast.Symbol (_, name) -> [ name ]
  | Ast.Keyword (_, name) -> [ name ]
  | Ast.List (_, items) | Ast.Vector (_, items) ->
      items |> List.concat_map effect_names_of_expr |> sorted_uniq_strings
  | Ast.Map (_, entries) ->
      entries
      |> List.concat_map (fun (key, value) ->
          effect_names_of_expr key @ effect_names_of_expr value)
      |> sorted_uniq_strings
  | Ast.Nil _ | Ast.Bool _ | Ast.Int _ | Ast.Float _ | Ast.String _ -> []

let rec expr_effects registry = function
  | Ast.List (_, Ast.Symbol (_, "perform") :: Ast.Symbol (_, op_name) :: args)
    ->
      let own_effects =
        match effect_operation_effect registry op_name with
        | Some effect_name -> [ effect_name ]
        | None -> []
      in
      union_effects own_effects (exprs_effects registry args)
  | Ast.List (_, Ast.Symbol (_, "handle") :: body :: handlers) ->
      let handled_effects, handler_effects =
        List.fold_left
          (fun (handled_effects, handler_effects) handler ->
            match handler with
            | Ast.List (_, Ast.Symbol (_, effect_name) :: clauses) ->
                let clause_effects =
                  clauses
                  |> List.concat_map (function
                    | Ast.List (_, [ _op_name; _params; clause_body ]) ->
                        expr_effects registry clause_body
                    | _ -> [])
                in
                ( effect_name :: handled_effects,
                  union_effects handler_effects clause_effects )
            | _ -> (handled_effects, handler_effects))
          ([], []) handlers
      in
      union_effects
        (subtract_effects (expr_effects registry body) handled_effects)
        handler_effects
  | Ast.List
      (_, Ast.Symbol (_, ("fn" | "lambda")) :: Ast.Vector (_, _params) :: body)
    ->
      exprs_effects registry body
  | Ast.List
      (_, Ast.Symbol (_, ("let" | "let*")) :: Ast.Vector (_, bindings) :: body)
    ->
      union_effects
        (exprs_effects registry bindings)
        (exprs_effects registry body)
  | Ast.List (_, items) | Ast.Vector (_, items) -> exprs_effects registry items
  | Ast.Map (_, entries) ->
      entries
      |> List.fold_left
           (fun effects (key, value) ->
             union_effects effects
               (union_effects
                  (expr_effects registry key)
                  (expr_effects registry value)))
           []
  | Ast.Nil _ | Ast.Bool _ | Ast.Int _ | Ast.Float _ | Ast.String _
  | Ast.Symbol _ | Ast.Keyword _ ->
      []

and exprs_effects registry exprs =
  List.fold_left
    (fun effects expr -> union_effects effects (expr_effects registry expr))
    [] exprs

type function_effect_annotation =
  | Not_function_type
  | Unannotated_function_type
  | Annotated_function_type of string list

let effect_names_from_source_text text =
  let len = String.length text in
  let rec find_arrow_bang i =
    if i + 2 >= len then None
    else if text.[i] = '-' && text.[i + 1] = '>' && text.[i + 2] = '!' then
      Some i
    else find_arrow_bang (i + 1)
  in
  let rec skip_ws i =
    if i < len && is_whitespace text.[i] then skip_ws (i + 1) else i
  in
  let rec find_closing_brace i =
    if i >= len then None
    else if text.[i] = '}' then Some i
    else find_closing_brace (i + 1)
  in
  match find_arrow_bang 0 with
  | None -> None
  | Some arrow_index -> (
      let effect_start = skip_ws (arrow_index + 3) in
      if effect_start >= len || text.[effect_start] <> '{' then None
      else
        match find_closing_brace (effect_start + 1) with
        | None -> None
        | Some effect_end ->
            let raw_names =
              String.sub text (effect_start + 1) (effect_end - effect_start - 1)
            in
            raw_names |> String.split_on_char ' '
            |> List.concat_map (fun chunk ->
                chunk |> String.split_on_char '\n'
                |> List.concat_map (String.split_on_char '\t'))
            |> List.map String.trim
            |> List.filter (fun name -> name <> "")
            |> sorted_uniq_strings
            |> fun effect_names -> Some effect_names)

let effect_names_from_source source span =
  let start_offset = span.Ast.start_offset in
  let end_offset = span.Ast.end_offset in
  if
    start_offset < 0
    || end_offset > String.length source
    || start_offset >= end_offset
  then None
  else
    let text = String.sub source start_offset (end_offset - start_offset) in
    effect_names_from_source_text text

let function_effect_annotation ?source_text = function
  | Ast.List (_, Ast.Symbol (_, "->!") :: effect_expr :: _param_and_ret) ->
      Annotated_function_type (effect_names_of_expr effect_expr)
  | Ast.List (span, Ast.Symbol (_, "->") :: _param_and_ret) -> (
      match source_text with
      | Some source -> (
          match effect_names_from_source source span with
          | Some effect_names -> Annotated_function_type effect_names
          | None -> Unannotated_function_type)
      | None -> Unannotated_function_type)
  | _ -> Not_function_type

let mismatched_effects_for_type_annotation ?source_text type_expr
    inferred_effects =
  match function_effect_annotation ?source_text type_expr with
  | Not_function_type -> []
  | Unannotated_function_type -> inferred_effects
  | Annotated_function_type declared_effects ->
      union_effects
        (subtract_effects inferred_effects declared_effects)
        (subtract_effects declared_effects inferred_effects)

let effect_error_diagnostic span message =
  Type_diagnostic.make ~span "typecheck/effect" message

let missing_effect_diagnostic span effect_names =
  effect_error_diagnostic span
    (Printf.sprintf "Missing effect(s): %s" (String.concat ", " effect_names))

let define_value_effects registry = function
  | Ast.List
      (_, [ Ast.Symbol (_, ("define" | "def")); Ast.Symbol (_, _); value_expr ])
    ->
      expr_effects registry value_expr
  | Ast.List
      ( _,
        Ast.Symbol (_, ("define" | "def"))
        :: Ast.List (_, _name :: _params)
        :: body ) ->
      exprs_effects registry body
  | _ -> []

let collect_missing_effect_diagnostics ?source_text registry exprs =
  let rec collect_top_level diagnostics = function
    | current :: (next :: _ as rest) -> (
        match
          (Lower_type.type_signature current, Lower_type.definition_name next)
        with
        | Some (name, type_expr), Some def_name when String.equal name def_name
          ->
            let diagnostics =
              let missing_effects =
                mismatched_effects_for_type_annotation ?source_text type_expr
                  (define_value_effects registry next)
              in
              if missing_effects = [] then diagnostics
              else
                missing_effect_diagnostic (Ast.expr_span next) missing_effects
                :: diagnostics
            in
            collect_top_level diagnostics rest
        | _ -> collect_top_level (collect_expr diagnostics current) rest)
    | [ expr ] -> List.rev (collect_expr diagnostics expr)
    | [] -> List.rev diagnostics
  and collect_expr diagnostics = function
    | Ast.List
        ( span,
          [
            (Ast.Symbol (_, ":") | Ast.Keyword (_, ":"));
            annotated_expr;
            type_expr;
          ] ) ->
        let diagnostics =
          let missing_effects =
            mismatched_effects_for_type_annotation ?source_text type_expr
              (expr_effects registry annotated_expr)
          in
          if missing_effects = [] then diagnostics
          else missing_effect_diagnostic span missing_effects :: diagnostics
        in
        collect_expr diagnostics annotated_expr
    | Ast.List
        (_, Ast.Symbol (_, ("fn" | "lambda")) :: Ast.Vector (_, _params) :: body)
      ->
        collect_exprs diagnostics body
    | Ast.List
        (_, Ast.Symbol (_, ("let" | "let*")) :: Ast.Vector (_, bindings) :: body)
      ->
        collect_exprs (collect_exprs diagnostics bindings) body
    | Ast.List (_, items) | Ast.Vector (_, items) ->
        collect_exprs diagnostics items
    | Ast.Map (_, entries) ->
        List.fold_left
          (fun diagnostics (key, value) ->
            collect_expr (collect_expr diagnostics key) value)
          diagnostics entries
    | Ast.Nil _ | Ast.Bool _ | Ast.Int _ | Ast.Float _ | Ast.String _
    | Ast.Symbol _ | Ast.Keyword _ ->
        diagnostics
  and collect_exprs diagnostics exprs =
    List.fold_left collect_expr diagnostics exprs
  in
  collect_top_level [] exprs

let rec rewrite_effect_expr = function
  | Ast.List (span, Ast.Symbol (_, "define-effect") :: _) -> Ast.Nil span
  | Ast.List (span, Ast.Symbol (_, "perform") :: Ast.Symbol (_, op_name) :: args)
    ->
      Ast.List
        (span, Ast.Symbol (span, op_name) :: List.map rewrite_effect_expr args)
  | Ast.List (_, Ast.Symbol (_, "handle") :: body :: _handlers) ->
      rewrite_effect_expr body
  | Ast.List (span, items) -> Ast.List (span, List.map rewrite_effect_expr items)
  | Ast.Vector (span, items) ->
      Ast.Vector (span, List.map rewrite_effect_expr items)
  | Ast.Map (span, entries) ->
      Ast.Map
        ( span,
          List.map
            (fun (key, value) ->
              (rewrite_effect_expr key, rewrite_effect_expr value))
            entries )
  | expr -> expr

let rewrite_effect_exprs exprs = List.map rewrite_effect_expr exprs

let collect_effect_typecheck_diagnostics ?source_text registry exprs =
  let rec collect_expr warnings errors = function
    | Ast.List
        (span, Ast.Symbol (_, "perform") :: Ast.Symbol (_, op_name) :: args) ->
        let errors =
          match effect_operation_effect registry op_name with
          | Some _ -> errors
          | None ->
              effect_error_diagnostic span
                (Printf.sprintf "Unknown effect operation: %s" op_name)
              :: errors
        in
        collect_exprs warnings errors args
    | Ast.List (span, Ast.Symbol (_, "handle") :: body :: handlers) ->
        let warnings =
          List.fold_left
            (fun warnings handler ->
              match handler with
              | Ast.List (_, Ast.Symbol (_, effect_name) :: _)
                when not (List.mem effect_name registry.effect_names) ->
                  warning_json span
                    (Printf.sprintf "Unknown effect: %s" effect_name)
                  :: warnings
              | _ -> warnings)
            warnings handlers
        in
        let warnings, errors = collect_expr warnings errors body in
        List.fold_left
          (fun (warnings, errors) handler ->
            match handler with
            | Ast.List (_, _effect_name :: clauses) ->
                List.fold_left
                  (fun (warnings, errors) clause ->
                    match clause with
                    | Ast.List (_, [ _op_name; _params; body ]) ->
                        collect_expr warnings errors body
                    | _ -> (warnings, errors))
                  (warnings, errors) clauses
            | _ -> (warnings, errors))
          (warnings, errors) handlers
    | Ast.List (_, items) | Ast.Vector (_, items) ->
        collect_exprs warnings errors items
    | Ast.Map (_, entries) ->
        List.fold_left
          (fun (warnings, errors) (key, value) ->
            let warnings, errors = collect_expr warnings errors key in
            collect_expr warnings errors value)
          (warnings, errors) entries
    | Ast.Nil _ | Ast.Bool _ | Ast.Int _ | Ast.Float _ | Ast.String _
    | Ast.Symbol _ | Ast.Keyword _ ->
        (warnings, errors)
  and collect_exprs warnings errors exprs =
    List.fold_left
      (fun (warnings, errors) expr -> collect_expr warnings errors expr)
      (warnings, errors) exprs
  in
  let warnings, errors = collect_exprs [] [] exprs in
  let missing_effect_errors =
    collect_missing_effect_diagnostics ?source_text registry exprs
  in
  (List.rev warnings, List.rev errors @ missing_effect_errors)

let split_top_level_arrows type_string =
  let len = String.length type_string in
  let rec loop depth start index parts =
    if index >= len then
      let part = String.sub type_string start (len - start) |> String.trim in
      List.rev (part :: parts)
    else
      match type_string.[index] with
      | '(' -> loop (depth + 1) start (index + 1) parts
      | ')' -> loop (max 0 (depth - 1)) start (index + 1) parts
      | _
        when depth = 0
             && index + 3 < len
             && String.sub type_string index 4 = " -> " ->
          let part =
            String.sub type_string start (index - start) |> String.trim
          in
          loop depth (index + 4) (index + 4) (part :: parts)
      | _ -> loop depth start (index + 1) parts
  in
  if len = 0 then [] else loop 0 0 0 []

let inject_effects_into_type_string type_string effect_names =
  match split_top_level_arrows type_string with
  | [] | [ _ ] -> type_string
  | parts ->
      let reversed = List.rev parts in
      let result = List.hd reversed in
      let params = List.rev (List.tl reversed) in
      Printf.sprintf "%s -{%s}-> %s"
        (String.concat " -> " params)
        (String.concat ", " effect_names)
        result

let effect_names_for_type_expr ~source_text type_expr =
  match type_expr with
  | Ast.List (span, Ast.Symbol (_, "->") :: _)
  | Ast.List (span, Ast.Symbol (_, "->!") :: _) ->
      effect_names_from_source source_text span
  | _ -> None

let rec find_signature_effects ~source_text name = function
  | Ast.List
      ( _,
        [
          (Ast.Symbol (_, ":") | Ast.Keyword (_, ":"));
          Ast.Symbol (_, signature_name);
          type_expr;
        ] )
    :: rest
    when String.equal name signature_name -> (
      match effect_names_for_type_expr ~source_text type_expr with
      | Some _ as effect_names -> effect_names
      | None -> find_signature_effects ~source_text name rest)
  | _ :: rest -> find_signature_effects ~source_text name rest
  | [] -> None

let annotated_result_type_string ~source_text exprs inferred_type =
  let effect_names =
    match List.rev exprs with
    | Ast.List
        ( _,
          [
            (Ast.Symbol (_, ":") | Ast.Keyword (_, ":"));
            _annotated_expr;
            type_expr;
          ] )
      :: _ ->
        effect_names_for_type_expr ~source_text type_expr
    | Ast.Symbol (_, name) :: _ ->
        find_signature_effects ~source_text name exprs
    | _ -> None
  in
  match effect_names with
  | Some effect_names when effect_names <> [] ->
      Some (inject_effects_into_type_string inferred_type effect_names)
  | _ -> None
