[@@@warning "-69"]

type diagnostic = { path : string; message : string }

type t = {
  name : string;
  from : string option;
  select : string list option;
  where : Ir_json.t option;
  datalog : Ir_json.t option;
  type_annotations : Ir_json.t option;
  loc : Ir_json.t option;
}

let diagnostic path message = { path; message }
let diagnostic_path (diagnostic : diagnostic) = diagnostic.path
let diagnostic_message (diagnostic : diagnostic) = diagnostic.message

let json_kind = function
  | Ir_json.Null -> "null"
  | Bool _ -> "bool"
  | Int _ -> "int"
  | Float _ -> "float"
  | String _ -> "string"
  | Array _ -> "array"
  | Object _ -> "object"
  | Map _ -> "map"

let field_path field = Printf.sprintf "$.%s" field

let required_string_field field declaration =
  match Canonical_ir_decl.payload_field field declaration with
  | Some (Ir_json.String value) -> Ok value
  | Some value ->
      Error
        [
          diagnostic (field_path field)
            (Printf.sprintf "Query payload field %s must be a string, got %s."
               field (json_kind value));
        ]
  | None ->
      Error
        [
          diagnostic (field_path field)
            (Printf.sprintf "Query payload must include a textual %s field."
               field);
        ]

let nullable_string_field field declaration =
  match Canonical_ir_decl.payload_field field declaration with
  | None | Some Ir_json.Null -> Ok None
  | Some (Ir_json.String value) -> Ok (Some value)
  | Some value ->
      Error
        [
          diagnostic (field_path field)
            (Printf.sprintf "Query payload field %s must be a string, got %s."
               field (json_kind value));
        ]

let optional_object_field field declaration =
  match Canonical_ir_decl.payload_field field declaration with
  | None | Some Ir_json.Null -> Ok None
  | Some (Ir_json.Object _ as value) -> Ok (Some value)
  | Some value ->
      Error
        [
          diagnostic (field_path field)
            (Printf.sprintf "Query payload field %s must be an object, got %s."
               field (json_kind value));
        ]

let optional_array_string_field field declaration =
  match Canonical_ir_decl.payload_field field declaration with
  | None | Some Ir_json.Null -> Ok None
  | Some (Ir_json.Array values) ->
      let rec loop acc index = function
        | [] -> Ok (Some (List.rev acc))
        | Ir_json.String value :: rest -> loop (value :: acc) (index + 1) rest
        | value :: _ ->
            Error
              [
                diagnostic
                  (Printf.sprintf "%s[%d]" (field_path field) index)
                  (Printf.sprintf
                     "Query payload field %s must contain only strings, got %s."
                     field (json_kind value));
              ]
      in
      loop [] 0 values
  | Some value ->
      Error
        [
          diagnostic (field_path field)
            (Printf.sprintf
               "Query payload field %s must be an array of strings, got %s."
               field (json_kind value));
        ]

let optional_any_field field declaration =
  Ok (Canonical_ir_decl.payload_field field declaration)

let query_of_declaration declaration =
  match
    ( required_string_field "name" declaration,
      nullable_string_field "from" declaration,
      optional_array_string_field "select" declaration,
      optional_object_field "datalog" declaration,
      optional_object_field "typeAnnotations" declaration,
      optional_object_field "loc" declaration,
      optional_any_field "where" declaration )
  with
  | ( Ok name,
      Ok from,
      Ok select,
      Ok datalog,
      Ok type_annotations,
      Ok loc,
      Ok where ) ->
      Ok { name; from; select; where; datalog; type_annotations; loc }
  | results ->
      let diagnostics_of_result = function
        | Ok _ -> []
        | Error diagnostics -> diagnostics
      in
      let name, from, select, datalog, type_annotations, loc, where = results in
      Error
        (diagnostics_of_result name @ diagnostics_of_result from
        @ diagnostics_of_result select
        @ diagnostics_of_result datalog
        @ diagnostics_of_result type_annotations
        @ diagnostics_of_result loc
        @ diagnostics_of_result where)

let of_declaration declaration =
  match Canonical_ir_decl.payload_string_field "kind" declaration with
  | Some "Query" ->
      query_of_declaration declaration |> Result.map (fun query -> Some query)
  | _ -> Ok None

let validate_declaration declaration =
  match of_declaration declaration with
  | Ok _ -> []
  | Error diagnostics -> diagnostics
