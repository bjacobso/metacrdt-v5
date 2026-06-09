open Mechanics_artifact_payload

let diagnostic = Mechanics_artifact_payload.diagnostic

let scalar_name = function
  | Ast.Symbol (_, name) | Ast.Keyword (_, name) | Ast.String (_, name) ->
      let has_keyword_prefix =
        String.length name > 0 && Char.equal name.[0] ':'
      in
      Some (if has_keyword_prefix then String.sub name 1 (String.length name - 1) else name)
  | _ -> None

let field_name = scalar_name

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
      | Some pairs -> Some ((String.sub key 1 (String.length key - 1), value) :: pairs)
      | None -> None)
  | _ -> None

let has_metadata_pairs values = Option.is_some (metadata_pairs values)

let is_schema_projection_expr = function
  | Ast.Symbol (_, name) ->
      String.length name = 0 || not (Char.equal name.[0] ':')
  | Ast.List
      ( _,
        Ast.Symbol
          ( _,
            ( "Struct" | "Array" | "Optional" | "Ref" | "Brand" | "Enum"
            | "Literal" | "Tuple" | "Union" | "TaggedUnion" | "Map" | "object"
            | "Object" | "array" | "optional" | "ref" | "brand" | "enum"
            | "literal" | "tuple" | "union" | "tagged-union" | "taggedUnion"
            | "map" ) )
        :: _ ) ->
      true
  | Ast.List (_, Ast.Symbol (_, name) :: metadata)
    when String.length name > 0
         && not (Char.equal name.[0] ':')
         && metadata <> [] && has_metadata_pairs metadata ->
      true
  | _ -> false

let is_schema_form = function
  | Ast.List
      ( _,
        [
          Ast.Symbol (_, "define-schema");
          Ast.Symbol (_, _);
          schema_expr;
        ] ) ->
      is_schema_projection_expr schema_expr
  | _ -> false

let is_fields_block = function
  | Ast.List (_, (Ast.Keyword (_, ":fields") | Ast.Symbol (_, ":fields")) :: _) ->
      true
  | _ -> false

let is_methods_block = function
  | Ast.List (_, (Ast.Keyword (_, ":methods") | Ast.Symbol (_, ":methods")) :: _) ->
      true
  | _ -> false

let is_error_form = function
  | Ast.List
      ( _,
        [
          Ast.Symbol (_, "define-error");
          Ast.Symbol (_, _);
          fields_expr;
        ] ) ->
      is_fields_block fields_expr
  | _ -> false

let is_service_form = function
  | Ast.List
      ( _,
        [
          Ast.Symbol (_, "define-service");
          Ast.Symbol (_, _);
          methods_expr;
        ] ) ->
      is_methods_block methods_expr
  | _ -> false

let is_operation_form = function
  | Ast.List (_, Ast.Symbol (_, "define-operation") :: _) -> true
  | _ -> false

let is_mechanics_form expr =
  is_schema_form expr || is_error_form expr || is_service_form expr
  || is_operation_form expr

let schema_payload name schema =
  Ir_json.Object
    [
      ("kind", Ir_json.String "SchemaDef");
      ("name", Ir_json.String name);
      ("schema", schema);
    ]

let error_payload name fields =
  Ir_json.Object
    [
      ("kind", Ir_json.String "ErrorDef");
      ("name", Ir_json.String name);
      ( "schema",
        kinded "Struct" [ ("fields", Ir_json.Array fields) ] );
    ]

let service_payload name methods =
  Ir_json.Object
    [
      ("kind", Ir_json.String "ServiceDef");
      ("name", Ir_json.String name);
      ("methods", Ir_json.Array methods);
    ]

let effect_payload name params effect_json body =
  Ir_json.Object
    [
      ("kind", Ir_json.String "EffectDef");
      ("name", Ir_json.String name);
      ("params", Ir_json.Array params);
      ("effect", effect_json);
      ("body", body);
    ]

let json_field name = function
  | Ir_json.Object entries -> List.assoc_opt name entries
  | _ -> None

let service_method_effects exprs =
  let collect_method service_name acc method_expr =
    match method_to_json service_name method_expr with
    | Error _ -> acc
    | Ok method_json -> (
      match (json_field "name" method_json, json_field "effect" method_json) with
      | Some (Ir_json.String method_name), Some effect_json ->
          ((service_name ^ "." ^ method_name), effect_json) :: acc
      | _ -> acc)
  in
  List.fold_left
    (fun acc -> function
      | Ast.List
          ( _,
            [
              Ast.Symbol (_, "define-service");
              Ast.Symbol (_, service_name);
              Ast.List
                ( _,
                  (Ast.Keyword (_, ":methods") | Ast.Symbol (_, ":methods"))
                  :: methods );
            ] ) ->
          List.fold_left (collect_method service_name) acc methods
      | _ -> acc)
    [] exprs

let packageable ~source_id ~form_index ~span kind name payload =
  let declaration =
    match Canonical_ir_decl.declaration_of_json payload with
    | Some declaration -> declaration
    | None -> failwith "mechanics artifact payload must include a kind"
  in
  let summary =
    Artifact_summary_types.make_declaration_summary ~kind ~name:(Some name)
      ~type_name:kind
  in
  Packageable_declaration.make
    ~payload:
      (Packageable_declaration.make_payload
         ~value:(Artifact_validated_payload.of_declaration declaration))
    ~payload_contract:Artifact_payload_descriptor.empty ~validators:[] ~summary
    ~source_id ~form_index ~span

let schema_declaration ~source_id ~form_index span name schema_expr =
  match schema_expr_to_json schema_expr with
  | Error _ as error -> error
  | Ok schema ->
      Ok
        (packageable ~source_id ~form_index ~span "SchemaDef" name
           (schema_payload name schema))

let error_declaration ~source_id ~form_index span name fields_expr =
  match fields_expr with
  | Ast.List (_, (Ast.Keyword (_, ":fields") | Ast.Symbol (_, ":fields")) :: fields) -> (
    match fields_to_json fields with
    | Error _ as error -> error
    | Ok fields ->
        Ok
          (packageable ~source_id ~form_index ~span "ErrorDef" name
             (error_payload name fields)))
  | bad ->
      Error
        [
          diagnostic ~span:(Ast.expr_span bad) "artifact/error"
            "define-error expects a (:fields ...) block.";
        ]

let service_declaration ~source_id ~form_index span name methods_expr =
  match methods_expr with
  | Ast.List (_, (Ast.Keyword (_, ":methods") | Ast.Symbol (_, ":methods")) :: methods)
    -> (
    match methods_to_json name methods with
    | Error _ as error -> error
    | Ok methods ->
        Ok
          (packageable ~source_id ~form_index ~span "ServiceDef" name
             (service_payload name methods)))
  | bad ->
      Error
        [
          diagnostic ~span:(Ast.expr_span bad) "artifact/service"
            "define-service expects a (:methods ...) block.";
        ]

let operation_declaration ~source_id ~form_index span signatures service_effects name
    params_expr body_exprs =
  match List.assoc_opt name signatures with
  | None ->
      Error
        [
          diagnostic ~span "artifact/effect"
            "define-operation requires a preceding type signature.";
        ]
  | Some signature -> (
    match operation_signature_to_json signature params_expr with
    | Error _ as error -> error
    | Ok (params, effect_json) ->
        let body =
          Mechanics_effect_body_json.operation_body_json source_id service_effects
            effect_json body_exprs
        in
        Ok
          (packageable ~source_id ~form_index ~span "EffectDef" name
             (effect_payload name params effect_json body)))

let declaration ~source_id ~form_index signatures service_effects = function
  | Ast.List
      ( span,
        [ Ast.Symbol (_, "define-schema"); Ast.Symbol (_, name); schema_expr ] )
    ->
      schema_declaration ~source_id ~form_index span name schema_expr
  | Ast.List (span, Ast.Symbol (_, "define-schema") :: _) ->
      Error
        [
          diagnostic ~span "artifact/schema"
            "define-schema expects a schema name and schema expression.";
        ]
  | Ast.List
      ( span,
        [ Ast.Symbol (_, "define-error"); Ast.Symbol (_, name); fields_expr ] )
    ->
      error_declaration ~source_id ~form_index span name fields_expr
  | Ast.List (span, Ast.Symbol (_, "define-error") :: _) ->
      Error
        [
          diagnostic ~span "artifact/error"
            "define-error expects an error name and (:fields ...) block.";
        ]
  | Ast.List
      ( span,
        [
          Ast.Symbol (_, "define-service");
          Ast.Symbol (_, name);
          methods_expr;
        ] )
    ->
      service_declaration ~source_id ~form_index span name methods_expr
  | Ast.List (span, Ast.Symbol (_, "define-service") :: _) ->
      Error
        [
          diagnostic ~span "artifact/service"
            "define-service expects a service name and (:methods ...) block.";
        ]
  | Ast.List
      ( span,
        Ast.Symbol (_, "define-operation") :: Ast.Symbol (_, name)
        :: (Ast.Vector (_, _) as params_expr) :: body_exprs ) ->
      operation_declaration ~source_id ~form_index span signatures
        service_effects name params_expr body_exprs
  | Ast.List (span, Ast.Symbol (_, "define-operation") :: _) ->
      Error
        [
          diagnostic ~span "artifact/effect"
            "define-operation expects a name, parameter vector, and body.";
        ]
  | _ -> Error []

let declarations ~source_id exprs =
  let signatures = operation_signatures exprs in
  let service_effects = service_method_effects exprs in
  let rec loop acc form_index = function
    | [] -> Ok (List.rev acc)
    | expr :: rest when is_mechanics_form expr -> (
      match declaration ~source_id ~form_index signatures service_effects expr with
      | Error [] -> loop acc (form_index + 1) rest
      | Error _ as error -> error
      | Ok declaration -> loop (declaration :: acc) (form_index + 1) rest)
    | _ :: rest -> loop acc (form_index + 1) rest
  in
  loop [] 0 exprs
