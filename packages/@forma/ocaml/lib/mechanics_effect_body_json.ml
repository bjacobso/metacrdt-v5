open Mechanics_artifact_payload

let source_span_json source_id span =
  Ir_json.Object
    [
      ("sourceId", Ir_json.String source_id);
      ("startOffset", Ir_json.Int span.Ast.start_offset);
      ("endOffset", Ir_json.Int span.Ast.end_offset);
    ]

let source_json source_id expr = source_span_json source_id (Ast.expr_span expr)

let rec var_or_literal_json source_id expr =
  let span = source_json source_id expr in
  match expr with
  | Ast.Symbol (_, name) ->
      Ir_json.Object
        [
          ("kind", Ir_json.String "Var");
          ("name", Ir_json.String name);
          ("span", span);
        ]
  | Ast.Keyword _ as expr ->
      Ir_json.Object
        [
          ("kind", Ir_json.String "Expr");
          ("source", expr_to_payload_json expr);
          ("span", span);
        ]
  | Ast.String (_, value) ->
      Ir_json.Object
        [
          ("kind", Ir_json.String "Literal");
          ("value", Ir_json.String value);
          ("span", span);
        ]
  | Ast.Int (_, value) ->
      Ir_json.Object
        [
          ("kind", Ir_json.String "Literal");
          ("value", Ir_json.Int value);
          ("span", span);
        ]
  | Ast.Float (_, value) ->
      Ir_json.Object
        [
          ("kind", Ir_json.String "Literal");
          ("value", Ir_json.Float value);
          ("span", span);
        ]
  | Ast.Bool (_, value) ->
      Ir_json.Object
        [
          ("kind", Ir_json.String "Literal");
          ("value", Ir_json.Bool value);
          ("span", span);
        ]
  | Ast.List (_, items) ->
      Ir_json.Object
        [
          ("kind", Ir_json.String "List");
          ("items", Ir_json.Array (List.map (var_or_literal_json source_id) items));
          ("span", span);
        ]
  | Ast.Vector (_, items) ->
      Ir_json.Object
        [
          ("kind", Ir_json.String "Vector");
          ("items", Ir_json.Array (List.map (var_or_literal_json source_id) items));
          ("span", span);
        ]
  | Ast.Map (_, entries) ->
      Ir_json.Object
        [
          ("kind", Ir_json.String "Record");
          ( "entries",
            Ir_json.Array
              (List.map
                 (fun (key, value) ->
                   Ir_json.Object
                     [
                       ("key", var_or_literal_json source_id key);
                       ("value", var_or_literal_json source_id value);
                     ])
                 entries) );
          ("span", span);
        ]
  | expr ->
      Ir_json.Object
        [
          ("kind", Ir_json.String "Expr");
          ("source", expr_to_payload_json expr);
          ("span", span);
        ]

let service_and_method name =
  match String.split_on_char '.' name with
  | [ service; method_name ] when service <> "" && method_name <> "" ->
      Some (service, method_name)
  | _ -> None

let rec effect_core_json source_id service_effects effect_json expr =
  match expr with
  | Ast.List (_, Ast.Symbol (_, head) :: args) -> (
    match service_and_method head with
    | Some (service, method_name) ->
        let call_effect =
          Option.value (List.assoc_opt head service_effects) ~default:effect_json
        in
        Ir_json.Object
          [
            ("kind", Ir_json.String "ServiceCall");
            ("service", Ir_json.String service);
            ("method", Ir_json.String method_name);
            ("args", Ir_json.Array (List.map (var_or_literal_json source_id) args));
            ("effect", call_effect);
            ("span", source_json source_id expr);
          ]
    | None -> (
      match head with
      | "succeed" ->
          let value =
            match args with
            | value :: _ -> var_or_literal_json source_id value
            | [] -> Ir_json.Null
          in
          Ir_json.Object
            [
              ("kind", Ir_json.String "Succeed");
              ("value", value);
              ("effect", effect_json);
              ("span", source_json source_id expr);
            ]
      | "fail" ->
          let error =
            match args with
            | value :: _ -> (
              match scalar_name value with
              | Some name -> Ir_json.String name
              | None -> var_or_literal_json source_id value)
            | [] -> Ir_json.Null
          in
          Ir_json.Object
            [
              ("kind", Ir_json.String "Fail");
              ("error", error);
              ("effect", effect_json);
              ("span", source_json source_id expr);
            ]
      | "<-" ->
          let value =
            match args with
            | value :: _ -> effect_core_json source_id service_effects effect_json value
            | [] -> Ir_json.Null
          in
          Ir_json.Object
            [
              ("kind", Ir_json.String "Bind");
              ("value", value);
              ("effect", effect_json);
              ("span", source_json source_id expr);
            ]
      | "do" ->
          Ir_json.Object
            [
              ("kind", Ir_json.String "Do");
              ( "forms",
                Ir_json.Array
                  (List.map
                     (effect_core_json source_id service_effects effect_json)
                     args) );
              ("effect", effect_json);
              ("span", source_json source_id expr);
            ]
      | "if" -> effect_if_json source_id service_effects effect_json expr args
      | "when" -> effect_when_json source_id service_effects effect_json expr args
      | "unless" -> effect_unless_json source_id service_effects effect_json expr args
      | "cond" -> effect_cond_json source_id service_effects effect_json expr args
      | "do!" -> effect_do_json source_id service_effects effect_json expr args
      | "let" -> effect_let_json source_id service_effects effect_json expr args
      | "match" -> effect_match_json source_id service_effects effect_json expr args
      | _ -> pure_effect_json source_id effect_json expr))
  | _ -> pure_effect_json source_id effect_json expr

and pure_effect_json source_id effect_json expr =
  Ir_json.Object
    [
      ("kind", Ir_json.String "Pure");
      ("value", var_or_literal_json source_id expr);
      ("effect", effect_json);
      ("span", source_json source_id expr);
    ]

and effect_if_json source_id service_effects effect_json expr = function
  | condition :: then_expr :: else_expr :: _ ->
      Ir_json.Object
        [
          ("kind", Ir_json.String "If");
          ("condition", var_or_literal_json source_id condition);
          ("then", effect_core_json source_id service_effects effect_json then_expr);
          ("else", effect_core_json source_id service_effects effect_json else_expr);
          ("effect", effect_json);
          ("span", source_json source_id expr);
        ]
  | _ ->
      Ir_json.Object
        [
          ("kind", Ir_json.String "If");
          ("effect", effect_json);
          ("span", source_json source_id expr);
        ]

and effect_when_json source_id service_effects effect_json expr = function
  | condition :: body ->
      Ir_json.Object
        [
          ("kind", Ir_json.String "When");
          ("condition", var_or_literal_json source_id condition);
          ("body", operation_body_json source_id service_effects effect_json body);
          ("effect", effect_json);
          ("span", source_json source_id expr);
        ]
  | [] ->
      Ir_json.Object
        [
          ("kind", Ir_json.String "When");
          ("effect", effect_json);
          ("span", source_json source_id expr);
        ]

and effect_unless_json source_id service_effects effect_json expr = function
  | condition :: body ->
      Ir_json.Object
        [
          ("kind", Ir_json.String "Unless");
          ("condition", var_or_literal_json source_id condition);
          ("body", operation_body_json source_id service_effects effect_json body);
          ("effect", effect_json);
          ("span", source_json source_id expr);
        ]
  | [] ->
      Ir_json.Object
        [
          ("kind", Ir_json.String "Unless");
          ("effect", effect_json);
          ("span", source_json source_id expr);
        ]

and effect_cond_json source_id service_effects effect_json expr args =
  let rec loop acc = function
    | condition :: body :: rest ->
        let clause =
          Ir_json.Object
            [
              ("condition", var_or_literal_json source_id condition);
              ("body", effect_core_json source_id service_effects effect_json body);
              ("span", source_json source_id condition);
            ]
        in
        loop (clause :: acc) rest
    | _ -> List.rev acc
  in
  Ir_json.Object
    [
      ("kind", Ir_json.String "Cond");
      ("clauses", Ir_json.Array (loop [] args));
      ("effect", effect_json);
      ("span", source_json source_id expr);
    ]

and effect_bindings_json source_id service_effects effect_json items =
  let rec loop acc = function
    | name :: value :: rest -> (
      match scalar_name name with
      | Some name ->
          let value =
            match value with
            | Ast.List (_, [ Ast.Symbol (_, "<-"); inner ]) -> inner
            | _ -> value
          in
          let binding =
            Ir_json.Object
              [
                ("name", Ir_json.String name);
                ("value", effect_core_json source_id service_effects effect_json value);
                ("span", source_json source_id value);
              ]
          in
          loop (binding :: acc) rest
      | None -> loop acc rest)
    | _ -> List.rev acc
  in
  loop [] items

and effect_do_json source_id service_effects effect_json expr = function
  | Ast.Vector (_, bindings) :: body ->
      Ir_json.Object
        [
          ("kind", Ir_json.String "Do");
          ( "bindings",
            Ir_json.Array
              (effect_bindings_json source_id service_effects effect_json bindings) );
          ("body", operation_body_json source_id service_effects effect_json body);
          ("effect", effect_json);
          ("span", source_json source_id expr);
        ]
  | _ ->
      Ir_json.Object
        [
          ("kind", Ir_json.String "Do");
          ("effect", effect_json);
          ("span", source_json source_id expr);
        ]

and effect_let_json source_id service_effects effect_json expr = function
  | Ast.Vector (_, bindings) :: body ->
      Ir_json.Object
        [
          ("kind", Ir_json.String "Let");
          ( "bindings",
            Ir_json.Array
              (effect_bindings_json source_id service_effects effect_json bindings) );
          ("body", operation_body_json source_id service_effects effect_json body);
          ("effect", effect_json);
          ("span", source_json source_id expr);
        ]
  | _ ->
      Ir_json.Object
        [
          ("kind", Ir_json.String "Let");
          ("effect", effect_json);
          ("span", source_json source_id expr);
        ]

and effect_match_json source_id service_effects effect_json expr = function
  | value :: arms ->
      let rec loop acc = function
        | pattern :: body :: rest ->
            let arm =
              Ir_json.Object
                [
                  ("pattern", var_or_literal_json source_id pattern);
                  ("body", effect_core_json source_id service_effects effect_json body);
                  ("span", source_json source_id pattern);
                ]
            in
            loop (arm :: acc) rest
        | _ -> List.rev acc
      in
      Ir_json.Object
        [
          ("kind", Ir_json.String "Match");
          ("value", var_or_literal_json source_id value);
          ("arms", Ir_json.Array (loop [] arms));
          ("effect", effect_json);
          ("span", source_json source_id expr);
        ]
  | [] ->
      Ir_json.Object
        [
          ("kind", Ir_json.String "Match");
          ("effect", effect_json);
          ("span", source_json source_id expr);
        ]

and operation_body_json source_id service_effects effect_json = function
  | [ body ] -> effect_core_json source_id service_effects effect_json body
  | bodies ->
      Ir_json.Object
        [
          ("kind", Ir_json.String "Do");
          ( "forms",
            Ir_json.Array
              (List.map (effect_core_json source_id service_effects effect_json) bodies) );
          ("effect", effect_json);
          ( "span",
            (match bodies with
            | first :: _ -> source_json source_id first
            | [] -> Ir_json.Null) );
        ]
