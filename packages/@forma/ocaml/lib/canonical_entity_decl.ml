[@@@warning "-69"]

type diagnostic = { path : string; message : string }

type field = {
  name : string;
  type_ : Ir_json.t;
  required : Ir_json.t option;
  indexed : Ir_json.t option;
}

type t = {
  kind : string;
  name : string;
  field_types : (string * Ir_json.t) list option;
  fields : field list;
  doc : string option;
  role : string option;
  id_pattern : string option;
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
            (Printf.sprintf "Entity payload field %s must be a string, got %s."
               field (json_kind value));
        ]
  | None ->
      Error
        [
          diagnostic (field_path field)
            (Printf.sprintf "Entity payload must include a textual %s field."
               field);
        ]

let optional_string_field field declaration =
  match Canonical_ir_decl.payload_field field declaration with
  | None | Some Ir_json.Null -> Ok None
  | Some (Ir_json.String value) -> Ok (Some value)
  | Some value ->
      Error
        [
          diagnostic (field_path field)
            (Printf.sprintf "Entity payload field %s must be a string, got %s."
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
            (Printf.sprintf "Entity payload field %s must be an object, got %s."
               field (json_kind value));
        ]

let required_type path = function
  | Ir_json.Null ->
      Error [ diagnostic path "Entity field type must not be null." ]
  | value -> Ok value

let field_name path entries =
  match List.assoc_opt "name" entries with
  | Some (Ir_json.String value) when value <> "" -> Ok value
  | Some (Ir_json.String _) ->
      Error [ diagnostic path "Entity field name must not be empty." ]
  | Some value ->
      Error
        [
          diagnostic path
            (Printf.sprintf "Entity field name must be a string, got %s."
               (json_kind value));
        ]
  | None -> Error [ diagnostic path "Entity field must include a name." ]

let field_type path entries =
  match List.assoc_opt "type" entries with
  | Some value -> required_type path value
  | None -> Error [ diagnostic path "Entity field must include a type." ]

let optional_entry name entries =
  match List.assoc_opt name entries with
  | None | Some Ir_json.Null -> None
  | Some value -> Some value

let field_of_json index = function
  | Ir_json.Object entries -> (
      let name_path = Printf.sprintf "$.fields[%d].name" index in
      let type_path = Printf.sprintf "$.fields[%d].type" index in
      let name = field_name name_path entries in
      let type_ = field_type type_path entries in
      match (name, type_) with
      | Ok name, Ok type_ ->
          Ok
            {
              name;
              type_;
              required = optional_entry "required" entries;
              indexed = optional_entry "indexed" entries;
            }
      | _ ->
          let diagnostics_of_result = function
            | Ok _ -> []
            | Error diagnostics -> diagnostics
          in
          Error (diagnostics_of_result name @ diagnostics_of_result type_))
  | value ->
      Error
        [
          diagnostic
            (Printf.sprintf "$.fields[%d]" index)
            (Printf.sprintf "Entity fields entries must be objects, got %s."
               (json_kind value));
        ]

let required_fields declaration =
  match Canonical_ir_decl.payload_field "fields" declaration with
  | Some (Ir_json.Array values) ->
      let rec loop acc diagnostics index = function
        | [] ->
            if diagnostics = [] then Ok (List.rev acc) else Error diagnostics
        | value :: rest -> (
            match field_of_json index value with
            | Ok field -> loop (field :: acc) diagnostics (index + 1) rest
            | Error field_diagnostics ->
                loop acc (diagnostics @ field_diagnostics) (index + 1) rest)
      in
      loop [] [] 0 values
  | Some value ->
      Error
        [
          diagnostic "$.fields"
            (Printf.sprintf
               "Entity payload field fields must be an array, got %s."
               (json_kind value));
        ]
  | None ->
      Error
        [
          diagnostic "$.fields"
            "Entity payload must include an array fields field.";
        ]

let optional_field_types declaration =
  match Canonical_ir_decl.payload_field "fieldTypes" declaration with
  | None | Some Ir_json.Null -> Ok None
  | Some (Ir_json.Object entries) ->
      let rec loop acc = function
        | [] -> Ok (Some (List.rev acc))
        | ("", _) :: _ ->
            Error
              [
                diagnostic "$.fieldTypes"
                  "Entity fieldTypes names must not be empty.";
              ]
        | (name, Ir_json.Null) :: _ ->
            Error
              [
                diagnostic
                  (Printf.sprintf "$.fieldTypes.%s" name)
                  "Entity fieldTypes values must not be null.";
              ]
        | (name, value) :: rest -> loop ((name, value) :: acc) rest
      in
      loop [] entries
  | Some value ->
      Error
        [
          diagnostic "$.fieldTypes"
            (Printf.sprintf
               "Entity payload field fieldTypes must be an object, got %s."
               (json_kind value));
        ]

let entity_of_declaration declaration kind =
  match
    ( required_string_field "name" declaration,
      optional_field_types declaration,
      required_fields declaration,
      optional_string_field "doc" declaration,
      optional_string_field "role" declaration,
      optional_string_field "idPattern" declaration,
      optional_object_field "loc" declaration )
  with
  | Ok name, Ok field_types, Ok fields, Ok doc, Ok role, Ok id_pattern, Ok loc
    ->
      Ok { kind; name; field_types; fields; doc; role; id_pattern; loc }
  | results ->
      let diagnostics_of_result = function
        | Ok _ -> []
        | Error diagnostics -> diagnostics
      in
      let name, field_types, fields, doc, role, id_pattern, loc = results in
      Error
        (diagnostics_of_result name
        @ diagnostics_of_result field_types
        @ diagnostics_of_result fields
        @ diagnostics_of_result doc @ diagnostics_of_result role
        @ diagnostics_of_result id_pattern
        @ diagnostics_of_result loc)

let of_declaration declaration =
  match Canonical_ir_decl.payload_string_field "kind" declaration with
  | Some ("Entity" as kind) | Some ("MetaEntity" as kind) ->
      entity_of_declaration declaration kind
      |> Result.map (fun entity -> Some entity)
  | _ -> Ok None

let validate_declaration declaration =
  match of_declaration declaration with
  | Ok _ -> []
  | Error diagnostics -> diagnostics
