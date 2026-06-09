let diagnostic ?span code message = ({ Eval.span; code; message } : Eval.diagnostic)

let source_span_json span =
  Ir_json.Object
    [
      ("sourceId", Ir_json.String span.Ast.source_id);
      ("startOffset", Ir_json.Int span.Ast.start_offset);
      ("endOffset", Ir_json.Int span.Ast.end_offset);
    ]

let scalar_name = function
  | Ast.Symbol (_, name) | Ast.Keyword (_, name) | Ast.String (_, name) ->
      let has_keyword_prefix =
        String.length name > 0 && Char.equal name.[0] ':'
      in
      Some
        (if has_keyword_prefix then String.sub name 1 (String.length name - 1)
         else name)
  | _ -> None

let rec metadata_pairs = function
  | [] -> Some []
  | (Ast.Keyword (_, key) | Ast.Symbol (_, key)) :: value :: rest
    when String.length key > 0 && Char.equal key.[0] ':' -> (
      match metadata_pairs rest with
      | Some pairs -> Some ((String.sub key 1 (String.length key - 1), value) :: pairs)
      | None -> None)
  | _ -> None

let split_trailing_metadata values =
  let rec loop acc = function
    | [] -> Some (List.rev acc, [])
    | ((Ast.Keyword _ | Ast.Symbol (_, _)) as key) :: _ as metadata -> (
      match key with
      | Ast.Keyword _ -> Option.map (fun pairs -> (List.rev acc, pairs)) (metadata_pairs metadata)
      | Ast.Symbol (_, name)
        when String.length name > 0 && Char.equal name.[0] ':' ->
          Option.map (fun pairs -> (List.rev acc, pairs)) (metadata_pairs metadata)
      | _ -> (
          match metadata with
          | item :: rest -> loop (item :: acc) rest
          | [] -> Some (List.rev acc, [])))
    | item :: rest -> loop (item :: acc) rest
  in
  loop [] values

let rec to_json_list convert acc = function
  | [] -> Ok (List.rev acc)
  | item :: rest -> (
    match convert item with
    | Error _ as error -> error
    | Ok item -> to_json_list convert (item :: acc) rest)

let tuple_schema_to_json ~schema_expr_to_json ~apply_metadata span items =
  match split_trailing_metadata items with
  | None ->
      Error [ diagnostic ~span "artifact/schema"
                "Tuple schema metadata must be keyword/value pairs." ]
  | Some ([], _) ->
      Error [ diagnostic ~span "artifact/schema"
                "Tuple schema expects at least one item schema." ]
  | Some (items, metadata) -> (
      match to_json_list schema_expr_to_json [] items with
      | Error _ as error -> error
      | Ok items ->
          Ok
            (apply_metadata ?span:(Some span)
               (Ir_json.Object
                  [
                    ("kind", Ir_json.String "Tuple");
                    ("items", Ir_json.Array items);
                    ("span", source_span_json span);
                  ])
               metadata))

let tuple_type_to_json ~type_expr_to_json expr items =
  match split_trailing_metadata items with
  | None ->
      Error [ diagnostic ~span:(Ast.expr_span expr) "artifact/type"
                "Tuple type metadata must be keyword/value pairs." ]
  | Some ([], _) ->
      Error [ diagnostic ~span:(Ast.expr_span expr) "artifact/type"
                "Tuple type expects at least one item." ]
  | Some (items, _) -> (
      match to_json_list type_expr_to_json [] items with
      | Error _ as error -> error
      | Ok items ->
          Ok
            (Ir_json.Object
               [
                 ("kind", Ir_json.String "Tuple");
                 ("items", Ir_json.Array items);
               ]))

let tagged_union_variants_to_json ~schema_expr_to_json variants =
  let rec loop acc = function
    | [] -> Ok (List.rev acc)
    | Ast.Vector (span, [ tag; schema ]) :: rest -> (
      match (scalar_name tag, schema_expr_to_json schema) with
      | Some tag, Ok schema ->
          loop
            (Ir_json.Object
               [
                 ("tag", Ir_json.String tag);
                 ("schema", schema);
                 ("span", source_span_json span);
               ]
            :: acc)
            rest
      | None, _ ->
          Error
            [
              diagnostic ~span:(Ast.expr_span tag) "artifact/schema"
                "TaggedUnion variant tags must be symbols, keywords, or \
                 strings.";
            ]
      | _, (Error _ as error) -> error)
    | bad :: _ ->
        Error
          [
            diagnostic ~span:(Ast.expr_span bad) "artifact/schema"
              "TaggedUnion variants must be [tag SchemaExpr].";
          ]
  in
  loop [] variants

let enum_schema_to_json ~kinded span values =
  let rec loop acc = function
    | [] -> Ok (List.rev acc)
    | value :: rest -> (
      match scalar_name value with
      | Some value -> loop (Ir_json.String value :: acc) rest
      | None ->
          Error
            [
              diagnostic ~span:(Ast.expr_span value) "artifact/schema"
                "Enum schema values must be symbols, keywords, or strings.";
            ])
  in
  if List.is_empty values then
    Error
      [
        diagnostic ~span "artifact/schema"
          "Enum schema expects at least one value.";
      ]
  else
    loop [] values
    |> Result.map (fun values ->
           kinded ~span "Literal" [ ("values", Ir_json.Array values) ])

let tagged_union_to_json ~schema_expr_to_json span = function
  | discriminator :: variants -> (
    match scalar_name discriminator with
    | None ->
        Error
          [
            diagnostic ~span:(Ast.expr_span discriminator) "artifact/schema"
              "TaggedUnion schema expects a discriminator.";
          ]
    | Some discriminator -> (
        match variants with
        | [] ->
            Error
              [
                diagnostic ~span "artifact/schema"
                  "TaggedUnion schema expects at least one variant schema.";
              ]
        | variants -> (
            match tagged_union_variants_to_json ~schema_expr_to_json variants with
            | Error _ as error -> error
            | Ok variants -> Ok (discriminator, variants))))
  | [] ->
      Error
        [
          diagnostic ~span "artifact/schema"
            "TaggedUnion schema expects a discriminator and variant schemas.";
        ]
