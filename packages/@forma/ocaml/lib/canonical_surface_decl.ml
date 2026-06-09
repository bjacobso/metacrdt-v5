[@@@warning "-69"]

type diagnostic = { path : string; message : string }
type column = { name : string; label : string option; expr : Ir_json.t option }

type view = {
  name : string;
  query : string option;
  title : string option;
  columns : column list;
  layout : Ir_json.t option;
  loc : Ir_json.t option;
}

type container = { name : string; title : string option; views : string list }
type t = View_payload of view | Workspace_payload of container

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

let optional_any_field field declaration =
  Ok (Canonical_ir_decl.payload_field field declaration)

let column_name path entries =
  match List.assoc_opt "name" entries with
  | Some (Ir_json.String value) when value <> "" -> Ok value
  | Some (Ir_json.String _) ->
      Error [ diagnostic path "View column name must not be empty." ]
  | Some value ->
      Error
        [
          diagnostic path
            (Printf.sprintf "View column name must be a string, got %s."
               (json_kind value));
        ]
  | None -> Error [ diagnostic path "View column must include a name." ]

let optional_column_string name index entries =
  match List.assoc_opt name entries with
  | None | Some Ir_json.Null -> Ok None
  | Some (Ir_json.String value) -> Ok (Some value)
  | Some value ->
      Error
        [
          diagnostic
            (Printf.sprintf "$.columns[%d].%s" index name)
            (Printf.sprintf "View column %s must be a string, got %s." name
               (json_kind value));
        ]

let optional_entry name entries =
  match List.assoc_opt name entries with
  | None | Some Ir_json.Null -> None
  | Some value -> Some value

let column_of_json index = function
  | Ir_json.Object entries -> (
      let name =
        column_name (Printf.sprintf "$.columns[%d].name" index) entries
      in
      let label = optional_column_string "label" index entries in
      match (name, label) with
      | Ok name, Ok label ->
          Ok { name; label; expr = optional_entry "expr" entries }
      | _ ->
          let diagnostics_of_result = function
            | Ok _ -> []
            | Error diagnostics -> diagnostics
          in
          Error (diagnostics_of_result name @ diagnostics_of_result label))
  | value ->
      Error
        [
          diagnostic
            (Printf.sprintf "$.columns[%d]" index)
            (Printf.sprintf "View columns entries must be objects, got %s."
               (json_kind value));
        ]

let required_columns declaration =
  match Canonical_ir_decl.payload_field "columns" declaration with
  | Some (Ir_json.Array values) ->
      let rec loop acc diagnostics index = function
        | [] ->
            if diagnostics = [] then Ok (List.rev acc) else Error diagnostics
        | value :: rest -> (
            match column_of_json index value with
            | Ok column -> loop (column :: acc) diagnostics (index + 1) rest
            | Error column_diagnostics ->
                loop acc (diagnostics @ column_diagnostics) (index + 1) rest)
      in
      loop [] [] 0 values
  | Some value ->
      Error
        [
          diagnostic "$.columns"
            (Printf.sprintf
               "View payload field columns must be an array, got %s."
               (json_kind value));
        ]
  | None ->
      Error
        [
          diagnostic "$.columns"
            "View payload must include an array columns field.";
        ]

let workspace_views declaration =
  match Canonical_ir_decl.payload_field "views" declaration with
  | Some (Ir_json.Array values) ->
      let rec loop acc diagnostics index = function
        | [] ->
            if diagnostics = [] then Ok (List.rev acc) else Error diagnostics
        | Ir_json.String value :: rest when value <> "" ->
            loop (value :: acc) diagnostics (index + 1) rest
        | Ir_json.String _ :: rest ->
            loop acc
              (diagnostics
              @ [
                  diagnostic
                    (Printf.sprintf "$.views[%d]" index)
                    "Workspace view references must not be empty.";
                ])
              (index + 1) rest
        | value :: rest ->
            loop acc
              (diagnostics
              @ [
                  diagnostic
                    (Printf.sprintf "$.views[%d]" index)
                    (Printf.sprintf
                       "Workspace view references must be strings, got %s."
                       (json_kind value));
                ])
              (index + 1) rest
      in
      loop [] [] 0 values
  | Some value ->
      Error
        [
          diagnostic "$.views"
            (Printf.sprintf
               "Workspace payload field views must be an array, got %s."
               (json_kind value));
        ]
  | None ->
      Error
        [
          diagnostic "$.views"
            "Workspace payload must include an array views field.";
        ]

let diagnostics_of_result = function
  | Ok _ -> []
  | Error diagnostics -> diagnostics

let view_of_declaration declaration =
  match
    ( required_string_field "View" "name" declaration,
      optional_string_field "View" "query" declaration,
      optional_string_field "View" "title" declaration,
      required_columns declaration,
      optional_any_field "layout" declaration,
      optional_object_field "View" "loc" declaration )
  with
  | Ok name, Ok query, Ok title, Ok columns, Ok layout, Ok loc ->
      Ok (View_payload { name; query; title; columns; layout; loc })
  | name, query, title, columns, layout, loc ->
      Error
        (diagnostics_of_result name
        @ diagnostics_of_result query
        @ diagnostics_of_result title
        @ diagnostics_of_result columns
        @ diagnostics_of_result layout
        @ diagnostics_of_result loc)

let workspace_of_declaration declaration =
  match
    ( required_string_field "Workspace" "name" declaration,
      optional_string_field "Workspace" "title" declaration,
      workspace_views declaration )
  with
  | Ok name, Ok title, Ok views -> Ok (Workspace_payload { name; title; views })
  | name, title, views ->
      Error
        (diagnostics_of_result name
        @ diagnostics_of_result title
        @ diagnostics_of_result views)

let of_declaration declaration =
  match Canonical_ir_decl.payload_string_field "kind" declaration with
  | Some "View" ->
      view_of_declaration declaration
      |> Result.map (fun surface -> Some surface)
  | Some "Workspace" ->
      workspace_of_declaration declaration
      |> Result.map (fun surface -> Some surface)
  | _ -> Ok None

let validate_declaration declaration =
  match of_declaration declaration with
  | Ok _ -> []
  | Error diagnostics -> diagnostics
