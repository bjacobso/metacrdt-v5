[@@@warning "-69"]

type diagnostic = Canonical_content_mapping_decl.diagnostic = {
  path : string;
  message : string;
}

type field = { type_ : string; path : string; options : Ir_json.t list option }

type page = {
  section_id : string option;
  assignee : string;
  fields : field list option;
}

type template = {
  name : string;
  description : string option;
  pages : page list;
  loc : Ir_json.t option;
}

type locale_entry = {
  key : Ir_json.t;
  label : string option;
  description : string option;
}

type locale_bundle = {
  item_name : string;
  locale : string;
  roles : locale_entry list;
  sections : locale_entry list;
  fields : locale_entry list;
  loc : Ir_json.t option;
}

type localized_bundle = {
  item_name : string;
  locales : string list;
  default_locale : string option;
  loc : Ir_json.t option;
}

type mapping_entry = Canonical_content_mapping_decl.mapping_entry = {
  kind : string;
  target : string option;
}

type file_binding = {
  name : string;
  template_blob : string;
  template_file : string option;
  template_filename : string option;
  document_name : string option;
  document_ref : Ir_json.t option;
  mappings : mapping_entry list;
  loc : Ir_json.t option;
}

type t =
  | Template_payload of template
  | Locale_payload of locale_bundle
  | Localized_payload of localized_bundle
  | File_binding_payload of file_binding

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

let diagnostics_of_result = function
  | Ok _ -> []
  | Error diagnostics -> diagnostics

let required_string_field label field declaration =
  match Canonical_ir_decl.payload_field field declaration with
  | Some (Ir_json.String value) when value <> "" -> Ok value
  | Some (Ir_json.String _) ->
      Error
        [
          diagnostic (field_path field)
            (Printf.sprintf "%s payload field %s must not be empty." label field);
        ]
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

let required_array field label parse declaration =
  match Canonical_ir_decl.payload_field field declaration with
  | Some value -> array_items (field_path field) label parse value
  | None ->
      Error
        [
          diagnostic (field_path field)
            (Printf.sprintf "%s payload must include %s." label field);
        ]

let option_json_of_json parent index = function
  | Ir_json.Object _ as value -> Ok value
  | value ->
      Error
        [
          diagnostic
            (Printf.sprintf "%s.options[%d]" parent index)
            (Printf.sprintf "Content option entries must be objects, got %s."
               (json_kind value));
        ]

let field_of_json page_index index = function
  | Ir_json.Object entries -> (
      let prefix = Printf.sprintf "$.pages[%d].fields[%d]" page_index index in
      let type_ =
        required_entry_string (prefix ^ ".type") "Content field" "type" entries
      in
      let path =
        required_entry_string (prefix ^ ".path") "Content field" "path" entries
      in
      let options =
        Result.bind
          (optional_entry_array (prefix ^ ".options") "Content field" "options"
             entries)
          (function
            | None -> Ok None
            | Some values ->
                array_items (prefix ^ ".options") "Content field options"
                  (option_json_of_json prefix)
                  (Ir_json.Array values)
                |> Result.map (fun options -> Some options))
      in
      match (type_, path, options) with
      | Ok type_, Ok path, Ok options -> Ok { type_; path; options }
      | type_, path, options ->
          Error
            (diagnostics_of_result type_
            @ diagnostics_of_result path
            @ diagnostics_of_result options))
  | value ->
      Error
        [
          diagnostic
            (Printf.sprintf "$.pages[%d].fields[%d]" page_index index)
            (Printf.sprintf "Content field entries must be objects, got %s."
               (json_kind value));
        ]

let page_fields page_index entries =
  match List.assoc_opt "fields" entries with
  | None | Some Ir_json.Null -> Ok None
  | Some value ->
      array_items
        (Printf.sprintf "$.pages[%d].fields" page_index)
        "Content page fields" (field_of_json page_index) value
      |> Result.map (fun fields -> Some fields)

let page_of_json index = function
  | Ir_json.Object entries -> (
      let prefix = Printf.sprintf "$.pages[%d]" index in
      let section_id =
        optional_entry_string (prefix ^ ".sectionId") "Content page" "sectionId"
          entries
      in
      let assignee =
        required_entry_string (prefix ^ ".assignee") "Content page" "assignee"
          entries
      in
      let fields = page_fields index entries in
      match (section_id, assignee, fields) with
      | Ok section_id, Ok assignee, Ok fields ->
          Ok { section_id; assignee; fields }
      | section_id, assignee, fields ->
          Error
            (diagnostics_of_result section_id
            @ diagnostics_of_result assignee
            @ diagnostics_of_result fields))
  | value ->
      Error
        [
          diagnostic
            (Printf.sprintf "$.pages[%d]" index)
            (Printf.sprintf "Content page entries must be objects, got %s."
               (json_kind value));
        ]

let template_of_declaration declaration =
  match
    ( required_string_field "Content template" "name" declaration,
      optional_string_field "Content template" "description" declaration,
      required_array "pages" "Content template pages" page_of_json declaration,
      optional_object_field "Content template" "loc" declaration )
  with
  | Ok name, Ok description, Ok pages, Ok loc ->
      Ok (Template_payload { name; description; pages; loc })
  | name, description, pages, loc ->
      Error
        (diagnostics_of_result name
        @ diagnostics_of_result description
        @ diagnostics_of_result pages
        @ diagnostics_of_result loc)

let locale_entry_of_json array_name key_name index = function
  | Ir_json.Object entries -> (
      let prefix = Printf.sprintf "$.%s[%d]" array_name index in
      let key =
        required_entry_value
          (prefix ^ "." ^ key_name)
          "Content locale entry" key_name entries
      in
      let label =
        optional_entry_string (prefix ^ ".label") "Content locale entry" "label"
          entries
      in
      let description =
        optional_entry_string (prefix ^ ".description") "Content locale entry"
          "description" entries
      in
      match (key, label, description) with
      | Ok key, Ok label, Ok description -> Ok { key; label; description }
      | key, label, description ->
          Error
            (diagnostics_of_result key
            @ diagnostics_of_result label
            @ diagnostics_of_result description))
  | value ->
      Error
        [
          diagnostic
            (Printf.sprintf "$.%s[%d]" array_name index)
            (Printf.sprintf "Content locale entries must be objects, got %s."
               (json_kind value));
        ]

let locale_bundle_of_declaration declaration =
  match
    ( required_string_field "Content locale" "documentName" declaration,
      required_string_field "Content locale" "locale" declaration,
      required_array "roles" "Content locale roles"
        (locale_entry_of_json "roles" "name")
        declaration,
      required_array "sections" "Content locale sections"
        (locale_entry_of_json "sections" "name")
        declaration,
      required_array "fields" "Content locale fields"
        (locale_entry_of_json "fields" "path")
        declaration,
      optional_object_field "Content locale" "loc" declaration )
  with
  | Ok item_name, Ok locale, Ok roles, Ok sections, Ok fields, Ok loc ->
      Ok (Locale_payload { item_name; locale; roles; sections; fields; loc })
  | item_name, locale, roles, sections, fields, loc ->
      Error
        (diagnostics_of_result item_name
        @ diagnostics_of_result locale
        @ diagnostics_of_result roles
        @ diagnostics_of_result sections
        @ diagnostics_of_result fields
        @ diagnostics_of_result loc)

let string_item array_name index = function
  | Ir_json.String value when value <> "" -> Ok value
  | Ir_json.String _ ->
      Error
        [
          diagnostic
            (Printf.sprintf "$.%s[%d]" array_name index)
            (Printf.sprintf "Content %s entries must not be empty." array_name);
        ]
  | value ->
      Error
        [
          diagnostic
            (Printf.sprintf "$.%s[%d]" array_name index)
            (Printf.sprintf "Content %s entries must be strings, got %s."
               array_name (json_kind value));
        ]

let localized_bundle_of_declaration declaration =
  match
    ( required_string_field "Content localized" "documentName" declaration,
      required_array "locales" "Content localized locales"
        (string_item "locales") declaration,
      optional_string_field "Content localized" "defaultLocale" declaration,
      optional_object_field "Content localized" "loc" declaration )
  with
  | Ok item_name, Ok locales, Ok default_locale, Ok loc ->
      Ok (Localized_payload { item_name; locales; default_locale; loc })
  | item_name, locales, default_locale, loc ->
      Error
        (diagnostics_of_result item_name
        @ diagnostics_of_result locales
        @ diagnostics_of_result default_locale
        @ diagnostics_of_result loc)

let file_binding_of_declaration declaration =
  match
    ( required_string_field "Content file binding" "name" declaration,
      required_string_field "Content file binding" "templateBlob" declaration,
      optional_string_field "Content file binding" "templateFile" declaration,
      optional_string_field "Content file binding" "templateFilename"
        declaration,
      optional_string_field "Content file binding" "documentName" declaration,
      optional_object_field "Content file binding" "documentRef" declaration,
      Canonical_content_mapping_decl.mappings_of_declaration declaration,
      optional_object_field "Content file binding" "loc" declaration )
  with
  | ( Ok name,
      Ok template_blob,
      Ok template_file,
      Ok template_filename,
      Ok document_name,
      Ok document_ref,
      Ok mappings,
      Ok loc ) ->
      Ok
        (File_binding_payload
           {
             name;
             template_blob;
             template_file;
             template_filename;
             document_name;
             document_ref;
             mappings;
             loc;
           })
  | ( name,
      template_blob,
      template_file,
      template_filename,
      document_name,
      document_ref,
      mappings,
      loc ) ->
      Error
        (diagnostics_of_result name
        @ diagnostics_of_result template_blob
        @ diagnostics_of_result template_file
        @ diagnostics_of_result template_filename
        @ diagnostics_of_result document_name
        @ diagnostics_of_result document_ref
        @ diagnostics_of_result mappings
        @ diagnostics_of_result loc)

let of_declaration declaration =
  match Canonical_ir_decl.payload_string_field "kind" declaration with
  | Some "Document" ->
      template_of_declaration declaration
      |> Result.map (fun payload -> Some payload)
  | Some "DocumentLocale" ->
      locale_bundle_of_declaration declaration
      |> Result.map (fun payload -> Some payload)
  | Some "DocumentLocalized" ->
      localized_bundle_of_declaration declaration
      |> Result.map (fun payload -> Some payload)
  | Some "PdfMapping" ->
      file_binding_of_declaration declaration
      |> Result.map (fun payload -> Some payload)
  | _ -> Ok None

let validate_declaration declaration =
  match of_declaration declaration with
  | Ok _ -> []
  | Error diagnostics -> diagnostics
