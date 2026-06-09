let diagnostic ?span code message = ({ Eval.span; code; message } : Eval.diagnostic)
let scalar_name = function
  | Ast.Symbol (_, name) | Ast.Keyword (_, name) | Ast.String (_, name) ->
      let prefixed = String.length name > 0 && Char.equal name.[0] ':' in
  Some (if prefixed then String.sub name 1 (String.length name - 1) else name)
  | _ -> None
let primitive_name name =
  match String.lowercase_ascii name with
  | "string" -> Some "String"
  | "int" | "integer" -> Some "Int"
  | "float" -> Some "Float"
  | "number" -> Some "Number"
  | "bool" | "boolean" -> Some "Bool"
  | "bytes" -> Some "Bytes"
  | "datetime" -> Some "DateTime"
  | "json" -> Some "Json"
  | "unit" -> Some "Unit"
  | _ -> None
let rec metadata_pairs = function
  | [] -> Some []
  | (Ast.Keyword (_, key) | Ast.Symbol (_, key)) :: value :: rest
    when String.length key > 0 && Char.equal key.[0] ':' -> (
      match metadata_pairs rest with
      | Some pairs ->
          Some ((String.sub key 1 (String.length key - 1), value) :: pairs)
      | None -> None)
  | _ -> None
let split_trailing_metadata values =
  let rec loop acc = function
    | [] -> Some (List.rev acc, [])
    | ((Ast.Keyword _ | Ast.Symbol (_, _)) as key) :: _ as metadata -> (
      match key with
      | Ast.Keyword _ -> (
          match metadata_pairs metadata with
          | Some pairs -> Some (List.rev acc, pairs)
          | None -> None)
      | Ast.Symbol (_, name)
        when String.length name > 0 && Char.equal name.[0] ':' -> (
          match metadata_pairs metadata with
          | Some pairs -> Some (List.rev acc, pairs)
          | None -> None)
      | _ -> (
          match metadata with
          | item :: rest -> loop (item :: acc) rest
          | [] -> Some (List.rev acc, [])))
    | item :: rest -> loop (item :: acc) rest
  in
  loop [] values

let scalar_json = function
  | Ast.Nil _ -> Some Ir_json.Null
  | Ast.Bool (_, value) -> Some (Ir_json.Bool value)
  | Ast.Int (_, value) -> Some (Ir_json.Int value)
  | Ast.Float (_, value) -> Some (Ir_json.Float value)
  | Ast.String (_, value) -> Some (Ir_json.String value)
  | Ast.Symbol (_, value) -> Some (Ir_json.String value)
  | Ast.Keyword (_, value) -> Some (Ir_json.String value)
  | _ -> None

let source_span_json = Mechanics_schema_json.source_span_json

let kinded ?span kind entries =
  let entries =
    match span with
    | Some span -> entries @ [ ("span", source_span_json span) ]
    | None -> entries
  in
  Ir_json.Object (("kind", Ir_json.String kind) :: entries)

let primitive ?span name = kinded ?span "Primitive" [ ("name", Ir_json.String name) ]
let ref_schema ?span name = kinded ?span "Ref" [ ("name", Ir_json.String name) ]

let apply_metadata ?span schema pairs =
  let brand, metadata =
    List.fold_left
      (fun (brand, metadata) (key, value) ->
        match (key, scalar_json value, scalar_name value) with
        | "brand", _, Some name -> (Some name, metadata)
        | "brand", _, None -> (brand, metadata)
        | _, Some value, _ -> (brand, (key, value) :: metadata)
        | _ -> (brand, metadata))
      (None, []) pairs
  in
  let schema =
    match brand with
    | Some name ->
        kinded ?span "Brand" [ ("name", Ir_json.String name); ("schema", schema) ]
    | None -> schema
  in
  match List.rev metadata with
  | [] -> schema
  | entries ->
      kinded ?span "Annotated"
        [ ("schema", schema); ("metadata", Ir_json.Object entries) ]

let rec schema_expr_to_json expr =
  match expr with
  | Ast.Symbol (span, name) | Ast.String (span, name) | Ast.Keyword (span, name) -> (
    match primitive_name name with
    | Some name -> Ok (primitive ~span name)
    | None -> Ok (ref_schema ~span name))
  | Ast.List (span, Ast.Symbol (_, ("Struct" | "object" | "Object")) :: fields)
    ->
      fields_to_json fields
      |> Result.map (fun fields ->
             kinded ~span "Struct" [ ("fields", Ir_json.Array fields) ])
  | Ast.List (span, Ast.Symbol (_, ("Array" | "array")) :: item :: metadata)
    -> (
    match metadata_pairs metadata with
    | None ->
        Error
          [
            diagnostic ~span:(Ast.expr_span expr) "artifact/schema"
              "Array schema metadata must be keyword/value pairs.";
          ]
    | Some metadata -> (
      match schema_expr_to_json item with
      | Error _ as error -> error
      | Ok item ->
          Ok
            (apply_metadata ~span
               (kinded ~span "Array" [ ("item", item) ])
               metadata)))
  | Ast.List
      (span, Ast.Symbol (_, ("Optional" | "optional")) :: item :: metadata)
    -> (
    match metadata_pairs metadata with
    | None ->
        Error
          [
            diagnostic ~span:(Ast.expr_span expr) "artifact/schema"
              "Optional schema metadata must be keyword/value pairs.";
          ]
    | Some metadata -> (
      match schema_expr_to_json item with
      | Error _ as error -> error
      | Ok item ->
          Ok
            (apply_metadata ~span
               (kinded ~span "Optional" [ ("item", item) ])
               metadata)))
  | Ast.List (span, Ast.Symbol (_, ("Map" | "map")) :: value :: metadata) -> (
    match metadata_pairs metadata with
    | None ->
        Error [ diagnostic ~span:(Ast.expr_span expr) "artifact/schema"
                  "Map schema metadata must be keyword/value pairs." ]
    | Some metadata -> (
      match schema_expr_to_json value with
      | Error _ as error -> error
      | Ok value ->
          Ok (apply_metadata ~span
                (kinded ~span "Map" [ ("value", value) ])
                metadata)))
  | Ast.List (span, [ Ast.Symbol (_, ("Map" | "map")) ]) ->
      Error [ diagnostic ~span "artifact/schema" "Map schema expects a value schema." ]
  | Ast.List (span, Ast.Symbol (_, ("Ref" | "ref")) :: target :: metadata) -> (
    match (scalar_name target, metadata_pairs metadata) with
    | Some target, Some metadata ->
        Ok (apply_metadata ~span (ref_schema ~span target) metadata)
    | None, _ ->
        Error
          [
            diagnostic ~span:(Ast.expr_span target) "artifact/schema"
              "Ref schema expects a symbolic target.";
          ]
    | _, None ->
        Error
          [
            diagnostic ~span:(Ast.expr_span expr) "artifact/schema"
              "Ref schema metadata must be keyword/value pairs.";
          ])
  | Ast.List (span, Ast.Symbol (_, ("Brand" | "brand")) :: brand :: base :: []) -> (
    match (scalar_name brand, schema_expr_to_json base) with
    | Some name, Ok schema ->
        Ok
          (kinded ~span "Brand"
             [ ("name", Ir_json.String name); ("schema", schema) ])
    | None, _ ->
        Error
          [
            diagnostic ~span:(Ast.expr_span brand) "artifact/schema"
              "Brand schema expects a symbolic brand name.";
          ]
    | _, (Error _ as error) -> error)
  | Ast.List (span, Ast.Symbol (_, ("Enum" | "enum")) :: values) ->
      Mechanics_schema_json.enum_schema_to_json
        ~kinded:(fun ~span -> kinded ~span) span values
  | Ast.List (span, Ast.Symbol (_, ("Literal" | "literal")) :: values) ->
      let rec loop acc = function
        | [] -> Ok (List.rev acc)
        | value :: rest -> (
          match scalar_json value with
          | Some value -> loop (value :: acc) rest
          | None ->
              Error
                [
                  diagnostic ~span:(Ast.expr_span value) "artifact/schema"
                    "Literal schema values must be scalar values.";
                ])
      in
      loop [] values
      |> Result.map (fun values ->
             kinded ~span "Literal" [ ("values", Ir_json.Array values) ])
  | Ast.List (span, Ast.Symbol (_, ("Tuple" | "tuple")) :: items) ->
      Mechanics_schema_json.tuple_schema_to_json ~schema_expr_to_json
        ~apply_metadata span items
  | Ast.List (span, Ast.Symbol (_, ("Union" | "union")) :: variants) -> (
    match split_trailing_metadata variants with
    | None ->
        Error
          [
            diagnostic ~span "artifact/schema"
              "Union schema metadata must be keyword/value pairs.";
          ]
    | Some (variants, metadata) -> (
    match variants with
    | [] ->
        Error
          [
            diagnostic ~span "artifact/schema"
              "Union schema expects at least one variant schema.";
          ]
    | variants -> (
        match schemas_to_json variants with
        | Error _ as error -> error
        | Ok variants ->
            Ok
              (apply_metadata ~span
                 (kinded ~span "Union" [ ("variants", Ir_json.Array variants) ])
                 metadata))))
  | Ast.List (span, Ast.Symbol (_, ("TaggedUnion" | "tagged-union" | "taggedUnion")) :: rest) -> (
    match rest with
    | discriminator :: variants -> (
      match split_trailing_metadata variants with
      | None ->
          Error
            [
              diagnostic ~span "artifact/schema"
                "TaggedUnion schema metadata must be keyword/value pairs.";
            ]
      | Some (variants, metadata) -> (
      match
        Mechanics_schema_json.tagged_union_to_json ~schema_expr_to_json span
          (discriminator :: variants)
      with
    | Error _ as error -> error
    | Ok (discriminator, variants) ->
        Ok
          (apply_metadata ~span
             (kinded ~span "TaggedUnion"
                [
                  ("discriminator", Ir_json.String discriminator);
                  ("variants", Ir_json.Array variants);
                ])
             metadata)))
    | [] ->
        Error
          [
            diagnostic ~span "artifact/schema"
              "TaggedUnion schema expects a discriminator and variant schemas.";
          ])
  | Ast.List (span, Ast.Symbol (_, name) :: metadata) -> (
    match (primitive_name name, metadata_pairs metadata) with
    | Some name, Some metadata ->
        Ok (apply_metadata ~span (primitive ~span name) metadata)
    | _, Some _ -> Ok (ref_schema ~span name)
    | _, None ->
        Error
          [
            diagnostic ~span:(Ast.expr_span expr) "artifact/schema"
              "Schema metadata must be keyword/value pairs.";
          ])
  | _ ->
      Error
        [
          diagnostic ~span:(Ast.expr_span expr) "artifact/schema"
            "Expected a schema symbol or schema expression.";
        ]

and field_to_json = function
  | Ast.Vector (span, [ name; schema ])
  | Ast.List (span, [ name; schema ])
  | Ast.List (span, [ Ast.Symbol (_, "field"); name; schema ]) -> (
    match (scalar_name name, schema_expr_to_json schema) with
    | Some name, Ok schema ->
        Ok
          (Ir_json.Object
             [
               ("name", Ir_json.String name);
               ("schema", schema);
               ("span", source_span_json span);
             ])
    | None, _ ->
        Error
          [
            diagnostic ~span:(Ast.expr_span name) "artifact/schema-field"
              "Struct schema field names must be symbols, keywords, or strings.";
          ]
    | _, (Error _ as error) -> error)
  | bad ->
      Error
        [
          diagnostic ~span:(Ast.expr_span bad) "artifact/schema-field"
            "Struct schema fields must be [name SchemaExpr] or (field name SchemaExpr).";
        ]

and fields_to_json fields =
  let rec loop acc = function
    | [] -> Ok (List.rev acc)
    | field :: rest -> (
      match field_to_json field with
      | Error _ as error -> error
      | Ok field -> loop (field :: acc) rest)
  in
  loop [] fields

and schemas_to_json schemas =
  let rec loop acc = function
    | [] -> Ok (List.rev acc)
    | schema :: rest -> (
      match schema_expr_to_json schema with
      | Error _ as error -> error
      | Ok schema -> loop (schema :: acc) rest)
  in
  loop [] schemas

let rec type_expr_to_json expr =
  match expr with
  | Ast.List (_, Ast.Symbol (_, "Effect") :: _) -> effect_type_to_json expr None
  | Ast.List (_, Ast.Symbol (_, ("Option" | "Optional")) :: [ item ]) -> (
    match type_expr_to_json item with
    | Error _ as error -> error
    | Ok item -> Ok (kinded "Optional" [ ("item", item) ]))
  | Ast.List (_, Ast.Symbol (_, ("Array" | "List")) :: [ item ]) -> (
    match type_expr_to_json item with
    | Error _ as error -> error
    | Ok item -> Ok (kinded "Array" [ ("item", item) ]))
  | Ast.List (_, Ast.Symbol (_, "Map") :: [ value ]) -> (
    match type_expr_to_json value with
    | Error _ as error -> error
    | Ok value -> Ok (kinded "Map" [ ("value", value) ]))
  | Ast.List (_, Ast.Symbol (_, "Tuple") :: items) ->
      Mechanics_schema_json.tuple_type_to_json ~type_expr_to_json expr items
  | Ast.List
      ( _,
        Ast.Symbol
          (_, (("Option" | "Optional" | "Array" | "List" | "Map") as head))
        :: _ )
    ->
      Error [ diagnostic ~span:(Ast.expr_span expr) "artifact/type"
                (head ^ " type expects one argument.") ]
  | _ -> schema_expr_to_json expr

and effect_type_to_json expr service_requirement =
  match expr with
  | Ast.List
      ( _,
        [
          Ast.Symbol (_, "Effect");
          success_expr;
          Ast.Vector (_, error_exprs);
          Ast.Vector (_, requirement_exprs);
        ] ) -> (
      match
        ( type_expr_to_json success_expr,
          symbolic_set_to_json "errors" error_exprs,
          symbolic_set_to_json "requirements" requirement_exprs )
      with
      | (Error diagnostics, _, _)
      | (_, Error diagnostics, _)
      | (_, _, Error diagnostics) ->
          Error diagnostics
      | (Ok success, Ok errors, Ok requirements) ->
          let requirements =
            match service_requirement with
            | Some service_name when not (List.mem service_name requirements) ->
                requirements @ [ service_name ]
            | _ -> requirements
          in
          Ok
            (kinded "Effect"
               [
                 ("success", success);
                 ( "errors",
                   Ir_json.Array
                     (List.map (fun name -> Ir_json.String name) errors) );
                 ( "requirements",
                   Ir_json.Array
                     (List.map (fun name -> Ir_json.String name) requirements) );
               ]))
  | _ ->
      Error
        [
          diagnostic ~span:(Ast.expr_span expr) "artifact/effect-type"
            "Effect type expects (Effect Success [Errors...] [Requirements...]).";
        ]

and symbolic_set_to_json label exprs =
  let rec loop acc = function
    | [] -> Ok (List.rev acc)
    | expr :: rest -> (
      match scalar_name expr with
      | Some name -> loop (name :: acc) rest
      | None ->
          Error
            [
              diagnostic ~span:(Ast.expr_span expr) "artifact/effect-type"
                ("Effect " ^ label ^ " entries must be symbolic names.");
            ])
  in
  loop [] exprs

let method_params_to_json = function
  | Ast.Vector (_, params) ->
      let rec loop acc = function
        | [] -> Ok (List.rev acc)
        | name :: type_expr :: rest -> (
          match (scalar_name name, type_expr_to_json type_expr) with
          | Some name, Ok type_json ->
              loop
                (Ir_json.Object
                   [ ("name", Ir_json.String name); ("type", type_json) ]
                :: acc)
                rest
          | None, _ ->
              Error
                [
                  diagnostic ~span:(Ast.expr_span name) "artifact/service-method"
                    "service method params require symbolic names.";
                ]
          | _, (Error _ as error) -> error)
        | bad :: [] ->
            Error
              [
                diagnostic ~span:(Ast.expr_span bad) "artifact/service-method"
                  "service method params must be [name Type ...] pairs.";
              ]
      in
      loop [] params
  | bad ->
      Error
        [
          diagnostic ~span:(Ast.expr_span bad) "artifact/service-method"
            "service method params must be [name Type ...] pairs.";
        ]

let method_to_json service_name = function
  | Ast.List (_, [ Ast.Symbol (_, method_name); params_expr; return_expr ]) -> (
    match method_params_to_json params_expr with
    | Error _ as error -> error
    | Ok params -> (
      match effect_type_to_json return_expr (Some service_name) with
      | Error _ as error -> error
      | Ok effect_json ->
          Ok
            (Ir_json.Object
               [
                 ("name", Ir_json.String method_name);
                 ("params", Ir_json.Array params);
                 ("effect", effect_json);
               ])))
  | bad ->
      Error
        [
          diagnostic ~span:(Ast.expr_span bad) "artifact/service-method"
            "service methods must be (name [param Type ...] ReturnEffect).";
        ]

let methods_to_json service_name methods =
  let rec loop acc = function
    | [] -> Ok (List.rev acc)
    | method_expr :: rest -> (
      match method_to_json service_name method_expr with
      | Error _ as error -> error
      | Ok method_json -> loop (method_json :: acc) rest)
  in
  loop [] methods

let rec expr_to_payload_json expr =
  let obj kind entries = Ir_json.Object (("kind", Ir_json.String kind) :: entries) in
  match expr with
  | Ast.Nil _ -> obj "Nil" []
  | Ast.Bool (_, value) -> obj "Bool" [ ("value", Ir_json.Bool value) ]
  | Ast.Int (_, value) -> obj "Number" [ ("value", Ir_json.Int value) ]
  | Ast.Float (_, value) -> obj "Number" [ ("value", Ir_json.Float value) ]
  | Ast.String (_, value) -> obj "String" [ ("value", Ir_json.String value) ]
  | Ast.Symbol (_, name) | Ast.Keyword (_, name) ->
      obj "Symbol" [ ("name", Ir_json.String name) ]
  | Ast.List (_, items) | Ast.Vector (_, items) ->
      let kind = match expr with Ast.List _ -> "List" | _ -> "Vector" in
      obj kind [ ("items", Ir_json.Array (List.map expr_to_payload_json items)) ]
  | Ast.Map (_, entries) ->
      let entry (key, value) =
        Ir_json.Object
          [ ("key", expr_to_payload_json key); ("value", expr_to_payload_json value) ]
      in
      obj "Map" [ ("entries", Ir_json.Array (List.map entry entries)) ]

let operation_signatures exprs =
  List.fold_left
    (fun acc -> function
      | Ast.List
          ( _,
            [
              (Ast.Symbol (_, ":") | Ast.Keyword (_, ":"));
              Ast.Symbol (_, name);
              signature_expr;
            ] )
        ->
          (name, signature_expr) :: acc
      | _ -> acc)
    [] exprs

let operation_signature_to_json signature params_expr =
  match (signature, params_expr) with
  | Ast.List (_, Ast.Symbol (_, "->") :: signature_items), Ast.Vector (_, params)
    when List.length signature_items >= 2 ->
      let input_types = List.rev (List.tl (List.rev signature_items)) in
      let effect_expr = List.hd (List.rev signature_items) in
      if List.length input_types <> List.length params then
        Error
          [
            diagnostic ~span:(Ast.expr_span params_expr) "artifact/effect"
              "operation signature arity must match define-operation parameters.";
          ]
      else
        let rec params_loop acc params input_types =
          match (params, input_types) with
          | [], [] -> Ok (List.rev acc)
          | param :: params_rest, input :: inputs_rest -> (
            match (scalar_name param, type_expr_to_json input) with
            | Some name, Ok type_json ->
                params_loop
                  (Ir_json.Object
                     [ ("name", Ir_json.String name); ("type", type_json) ]
                  :: acc)
                  params_rest inputs_rest
            | None, _ ->
                Error
                  [
                    diagnostic ~span:(Ast.expr_span param) "artifact/effect"
                      "operation parameters must be symbolic names.";
                  ]
            | _, (Error _ as error) -> error)
          | _ -> assert false
        in
        (match
           (params_loop [] params input_types, effect_type_to_json effect_expr None)
         with
        | (Error diagnostics, _) | (_, Error diagnostics) -> Error diagnostics
        | (Ok params, Ok effect_json) -> Ok (params, effect_json))
  | _ ->
      Error
        [
          diagnostic ~span:(Ast.expr_span signature) "artifact/effect"
            "operation signature must be (-> Input... (Effect ...)).";
        ]
