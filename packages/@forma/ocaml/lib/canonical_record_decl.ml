[@@@warning "-69"]

type diagnostic = { path : string; message : string }

type t = {
  id : string;
  entity : string;
  fields : (string * Ir_json.t) list;
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
            (Printf.sprintf "Record payload field %s must be a string, got %s."
               field (json_kind value));
        ]
  | None ->
      Error
        [
          diagnostic (field_path field)
            (Printf.sprintf "Record payload must include a textual %s field."
               field);
        ]

let optional_object_field field declaration =
  match Canonical_ir_decl.payload_field field declaration with
  | None | Some Ir_json.Null -> Ok None
  | Some (Ir_json.Object _ as value) -> Ok (Some value)
  | Some value ->
      Error
        [
          diagnostic (field_path field)
            (Printf.sprintf "Record payload field %s must be an object, got %s."
               field (json_kind value));
        ]

let required_fields declaration =
  match Canonical_ir_decl.payload_field "fields" declaration with
  | Some (Ir_json.Object entries) ->
      let rec loop acc = function
        | [] -> Ok (List.rev acc)
        | ("", _) :: _ ->
            Error
              [
                diagnostic "$.fields"
                  "Record payload field names must not be empty.";
              ]
        | (name, value) :: rest -> loop ((name, value) :: acc) rest
      in
      loop [] entries
  | Some value ->
      Error
        [
          diagnostic "$.fields"
            (Printf.sprintf
               "Record payload field fields must be an object, got %s."
               (json_kind value));
        ]
  | None ->
      Error
        [
          diagnostic "$.fields"
            "Record payload must include an object fields field.";
        ]

let record_of_declaration declaration =
  match
    ( required_string_field "id" declaration,
      required_string_field "entity" declaration,
      required_fields declaration,
      optional_object_field "loc" declaration )
  with
  | Ok id, Ok entity, Ok fields, Ok loc -> Ok { id; entity; fields; loc }
  | results ->
      let diagnostics_of_result = function
        | Ok _ -> []
        | Error diagnostics -> diagnostics
      in
      let id, entity, fields, loc = results in
      Error
        (diagnostics_of_result id
        @ diagnostics_of_result entity
        @ diagnostics_of_result fields
        @ diagnostics_of_result loc)

let of_declaration declaration =
  match Canonical_ir_decl.payload_string_field "kind" declaration with
  | Some "Record" ->
      record_of_declaration declaration
      |> Result.map (fun record -> Some record)
  | _ -> Ok None

let validate_declaration declaration =
  match of_declaration declaration with
  | Ok _ -> []
  | Error diagnostics -> diagnostics
