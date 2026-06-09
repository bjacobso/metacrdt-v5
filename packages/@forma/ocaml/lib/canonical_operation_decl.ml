[@@@warning "-69"]

type diagnostic = { path : string; message : string }
type input = { name : string; type_ : Ir_json.t; required : Ir_json.t option }

type t = {
  kind : string;
  name : string;
  doc : string option;
  inputs : input list;
  body : Ir_json.t;
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

let required_string_field label field declaration =
  match Canonical_ir_decl.payload_field field declaration with
  | Some (Ir_json.String value) -> Ok value
  | Some value ->
      Error
        [
          diagnostic (field_path field)
            (Printf.sprintf "%s payload field %s must be a string, got %s."
               label field (json_kind value));
        ]
  | None ->
      Error
        [
          diagnostic (field_path field)
            (Printf.sprintf "%s payload must include a textual %s field." label
               field);
        ]

let optional_string_field label field declaration =
  match Canonical_ir_decl.payload_field field declaration with
  | None | Some Ir_json.Null -> Ok None
  | Some (Ir_json.String value) -> Ok (Some value)
  | Some value ->
      Error
        [
          diagnostic (field_path field)
            (Printf.sprintf "%s payload field %s must be a string, got %s."
               label field (json_kind value));
        ]

let optional_object_field label field declaration =
  match Canonical_ir_decl.payload_field field declaration with
  | None | Some Ir_json.Null -> Ok None
  | Some (Ir_json.Object _ as value) -> Ok (Some value)
  | Some value ->
      Error
        [
          diagnostic (field_path field)
            (Printf.sprintf "%s payload field %s must be an object, got %s."
               label field (json_kind value));
        ]

let required_body label declaration =
  match Canonical_ir_decl.payload_field "do" declaration with
  | Some Ir_json.Null ->
      Error
        [ diagnostic "$.do" (label ^ " payload do field must not be null.") ]
  | Some value -> Ok value
  | None ->
      Error [ diagnostic "$.do" (label ^ " payload must include a do field.") ]

let input_name path label entries =
  match List.assoc_opt "name" entries with
  | Some (Ir_json.String value) when value <> "" -> Ok value
  | Some (Ir_json.String _) ->
      Error
        [
          diagnostic path
            (Printf.sprintf "%s input name must not be empty." label);
        ]
  | Some value ->
      Error
        [
          diagnostic path
            (Printf.sprintf "%s input name must be a string, got %s." label
               (json_kind value));
        ]
  | None ->
      Error
        [
          diagnostic path (Printf.sprintf "%s input must include a name." label);
        ]

let input_type path label entries =
  match List.assoc_opt "type" entries with
  | Some Ir_json.Null ->
      Error
        [
          diagnostic path
            (Printf.sprintf "%s input type must not be null." label);
        ]
  | Some value -> Ok value
  | None ->
      Error
        [
          diagnostic path (Printf.sprintf "%s input must include a type." label);
        ]

let optional_entry name entries =
  match List.assoc_opt name entries with
  | None | Some Ir_json.Null -> None
  | Some value -> Some value

let input_of_json label index = function
  | Ir_json.Object entries -> (
      let name_path = Printf.sprintf "$.inputs[%d].name" index in
      let type_path = Printf.sprintf "$.inputs[%d].type" index in
      let name = input_name name_path label entries in
      let type_ = input_type type_path label entries in
      match (name, type_) with
      | Ok name, Ok type_ ->
          Ok { name; type_; required = optional_entry "required" entries }
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
            (Printf.sprintf "$.inputs[%d]" index)
            (Printf.sprintf "%s inputs entries must be objects, got %s." label
               (json_kind value));
        ]

let required_inputs label declaration =
  match Canonical_ir_decl.payload_field "inputs" declaration with
  | Some (Ir_json.Array values) ->
      let rec loop acc diagnostics index = function
        | [] ->
            if diagnostics = [] then Ok (List.rev acc) else Error diagnostics
        | value :: rest -> (
            match input_of_json label index value with
            | Ok input -> loop (input :: acc) diagnostics (index + 1) rest
            | Error input_diagnostics ->
                loop acc (diagnostics @ input_diagnostics) (index + 1) rest)
      in
      loop [] [] 0 values
  | Some value ->
      Error
        [
          diagnostic "$.inputs"
            (Printf.sprintf "%s payload field inputs must be an array, got %s."
               label (json_kind value));
        ]
  | None ->
      Error
        [
          diagnostic "$.inputs"
            (Printf.sprintf "%s payload must include an array inputs field."
               label);
        ]

let diagnostics_of_result = function
  | Ok _ -> []
  | Error diagnostics -> diagnostics

let operation_of_declaration declaration kind =
  match
    ( required_string_field kind "name" declaration,
      optional_string_field kind "doc" declaration,
      required_inputs kind declaration,
      required_body kind declaration,
      optional_object_field kind "loc" declaration )
  with
  | Ok name, Ok doc, Ok inputs, Ok body, Ok loc ->
      Ok { kind; name; doc; inputs; body; loc }
  | name, doc, inputs, body, loc ->
      Error
        (diagnostics_of_result name @ diagnostics_of_result doc
        @ diagnostics_of_result inputs
        @ diagnostics_of_result body @ diagnostics_of_result loc)

let of_declaration declaration =
  match Canonical_ir_decl.payload_string_field "kind" declaration with
  | Some ("Action" as kind) | Some ("Mutation" as kind) ->
      operation_of_declaration declaration kind
      |> Result.map (fun operation -> Some operation)
  | _ -> Ok None

let validate_declaration declaration =
  match of_declaration declaration with
  | Ok _ -> []
  | Error diagnostics -> diagnostics
