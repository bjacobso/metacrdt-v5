type diagnostic = { path : string; message : string }
type mapping_entry = { kind : string; target : string option }

let diagnostic path message = { path; message }

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

let diagnostics_of_result = function
  | Ok _ -> []
  | Error diagnostics -> diagnostics

let required_entry_string path label name entries =
  match List.assoc_opt name entries with
  | Some (Ir_json.String value) when value <> "" -> Ok value
  | Some (Ir_json.String _) ->
      Error
        [
          diagnostic path (Printf.sprintf "%s %s must not be empty." label name);
        ]
  | Some value ->
      Error
        [
          diagnostic path
            (Printf.sprintf "%s %s must be a string, got %s." label name
               (json_kind value));
        ]
  | None ->
      Error
        [ diagnostic path (Printf.sprintf "%s must include %s." label name) ]

let optional_entry_string path label name entries =
  match List.assoc_opt name entries with
  | None | Some Ir_json.Null -> Ok None
  | Some (Ir_json.String value) -> Ok (Some value)
  | Some value ->
      Error
        [
          diagnostic path
            (Printf.sprintf "%s %s must be a string, got %s." label name
               (json_kind value));
        ]

let optional_entry_array path label name entries =
  match List.assoc_opt name entries with
  | None | Some Ir_json.Null -> Ok None
  | Some (Ir_json.Array values) -> Ok (Some values)
  | Some value ->
      Error
        [
          diagnostic path
            (Printf.sprintf "%s %s must be an array, got %s." label name
               (json_kind value));
        ]

let required_entry_value path label name entries =
  match List.assoc_opt name entries with
  | Some Ir_json.Null ->
      Error
        [
          diagnostic path (Printf.sprintf "%s %s must not be null." label name);
        ]
  | Some value -> Ok value
  | None ->
      Error
        [ diagnostic path (Printf.sprintf "%s must include %s." label name) ]

let array_items path label parse = function
  | Ir_json.Array values ->
      let rec loop acc diagnostics index = function
        | [] ->
            if diagnostics = [] then Ok (List.rev acc) else Error diagnostics
        | value :: rest -> (
            match parse index value with
            | Ok item -> loop (item :: acc) diagnostics (index + 1) rest
            | Error item_diagnostics ->
                loop acc (diagnostics @ item_diagnostics) (index + 1) rest)
      in
      loop [] [] 0 values
  | value ->
      Error
        [
          diagnostic path
            (Printf.sprintf "%s must be an array, got %s." label
               (json_kind value));
        ]

let required_non_empty_array field label parse declaration =
  match Canonical_ir_decl.payload_field field declaration with
  | Some value -> (
      match array_items (field_path field) label parse value with
      | Ok [] ->
          Error
            [
              diagnostic (field_path field)
                (Printf.sprintf "%s payload must not be empty." label);
            ]
      | result -> result)
  | None ->
      Error
        [
          diagnostic (field_path field)
            (Printf.sprintf "%s payload must include %s." label field);
        ]

let case_assignment_of_json mapping_index case_index index = function
  | Ir_json.Object entries -> (
      let prefix =
        Printf.sprintf "$.mappings[%d].cases[%d].assignments[%d]" mapping_index
          case_index index
      in
      let pdf_field =
        required_entry_string (prefix ^ ".pdfField")
          "Content mapping assignment" "pdfField" entries
      in
      let value =
        required_entry_value (prefix ^ ".value") "Content mapping assignment"
          "value" entries
      in
      match (pdf_field, value) with
      | Ok _, Ok _ -> Ok ()
      | pdf_field, value ->
          Error (diagnostics_of_result pdf_field @ diagnostics_of_result value))
  | value ->
      Error
        [
          diagnostic
            (Printf.sprintf "$.mappings[%d].cases[%d].assignments[%d]"
               mapping_index case_index index)
            (Printf.sprintf
               "Content mapping assignments must be objects, got %s."
               (json_kind value));
        ]

let required_case_assignments mapping_index case_index prefix entries =
  match
    optional_entry_array (prefix ^ ".assignments") "Content mapping case"
      "assignments" entries
  with
  | Ok None ->
      Error
        [
          diagnostic (prefix ^ ".assignments")
            "Content mapping case must include assignments.";
        ]
  | Ok (Some []) ->
      Error
        [
          diagnostic (prefix ^ ".assignments")
            "Content mapping case assignments must not be empty.";
        ]
  | Ok (Some values) ->
      array_items (prefix ^ ".assignments") "Content mapping assignments"
        (case_assignment_of_json mapping_index case_index)
        (Ir_json.Array values)
      |> Result.map (fun _ -> ())
  | Error diagnostics -> Error diagnostics

let case_of_json mapping_index index = function
  | Ir_json.Object entries -> (
      let prefix =
        Printf.sprintf "$.mappings[%d].cases[%d]" mapping_index index
      in
      let when_ =
        optional_entry_string (prefix ^ ".when") "Content mapping case" "when"
          entries
      in
      let assignments =
        required_case_assignments mapping_index index prefix entries
      in
      match (when_, assignments) with
      | Ok _, Ok () -> Ok ()
      | when_, assignments ->
          Error (diagnostics_of_result when_ @ diagnostics_of_result assignments)
      )
  | value ->
      Error
        [
          diagnostic
            (Printf.sprintf "$.mappings[%d].cases[%d]" mapping_index index)
            (Printf.sprintf "Content mapping cases must be objects, got %s."
               (json_kind value));
        ]

let required_mapping_field prefix name entries =
  required_entry_string (prefix ^ "." ^ name) "Content mapping" name entries
  |> Result.map (fun _ -> ())

let required_mapping_value prefix name entries =
  required_entry_value (prefix ^ "." ^ name) "Content mapping" name entries
  |> Result.map (fun _ -> ())

let parse_mapping_cases index prefix values =
  array_items (prefix ^ ".cases") "Content mapping cases" (case_of_json index)
    (Ir_json.Array values)
  |> Result.map (fun _ -> ())

let optional_mapping_cases index prefix = function
  | None -> Ok ()
  | Some values -> parse_mapping_cases index prefix values

let required_mapping_cases index prefix = function
  | None ->
      Error
        [ diagnostic (prefix ^ ".cases") "Content mapping must include cases." ]
  | Some [] ->
      Error
        [
          diagnostic (prefix ^ ".cases")
            "Content mapping switch cases must not be empty.";
        ]
  | Some values -> parse_mapping_cases index prefix values

let validate_mapping_kind_shape index kind entries cases =
  let prefix = Printf.sprintf "$.mappings[%d]" index in
  match String.lowercase_ascii kind with
  | "direct" -> (
      match
        ( required_mapping_field prefix "pdfField" entries,
          optional_mapping_cases index prefix cases )
      with
      | Ok (), Ok () -> Ok ()
      | pdf_field, cases ->
          Error (diagnostics_of_result pdf_field @ diagnostics_of_result cases))
  | "computed" -> (
      match
        ( required_mapping_value prefix "expr" entries,
          required_mapping_field prefix "pdfField" entries,
          optional_mapping_cases index prefix cases )
      with
      | Ok (), Ok (), Ok () -> Ok ()
      | expr, pdf_field, cases ->
          Error
            (diagnostics_of_result expr
            @ diagnostics_of_result pdf_field
            @ diagnostics_of_result cases))
  | "switch" -> required_mapping_cases index prefix cases
  | _ ->
      Error
        [
          diagnostic (prefix ^ ".kind")
            "Content mapping kind must be direct, computed, or switch.";
        ]

let mapping_of_json index = function
  | Ir_json.Object entries -> (
      let prefix = Printf.sprintf "$.mappings[%d]" index in
      let kind =
        required_entry_string (prefix ^ ".kind") "Content mapping" "kind"
          entries
      in
      let target =
        optional_entry_string (prefix ^ ".pdfField") "Content mapping"
          "pdfField" entries
      in
      let source =
        optional_entry_string (prefix ^ ".source") "Content mapping" "source"
          entries
      in
      let transform =
        optional_entry_string (prefix ^ ".transform") "Content mapping"
          "transform" entries
      in
      let cases =
        optional_entry_array (prefix ^ ".cases") "Content mapping" "cases"
          entries
      in
      let shape =
        match (kind, cases) with
        | Ok kind, Ok cases ->
            validate_mapping_kind_shape index kind entries cases
        | _ -> Ok ()
      in
      match (kind, target, source, transform, cases, shape) with
      | Ok kind, Ok target, Ok _, Ok _, Ok _, Ok () -> Ok { kind; target }
      | kind, target, source, transform, cases, shape ->
          Error
            (diagnostics_of_result kind
            @ diagnostics_of_result target
            @ diagnostics_of_result source
            @ diagnostics_of_result transform
            @ diagnostics_of_result cases
            @ diagnostics_of_result shape))
  | value ->
      Error
        [
          diagnostic
            (Printf.sprintf "$.mappings[%d]" index)
            (Printf.sprintf "Content mapping entries must be objects, got %s."
               (json_kind value));
        ]

let mappings_of_declaration declaration =
  required_non_empty_array "mappings" "Content file binding mappings"
    mapping_of_json declaration
