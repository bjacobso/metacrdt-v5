type span = { source_id : string; start_offset : int; end_offset : int }

type expr =
  | Nil of span
  | Bool of span * bool
  | Int of span * int
  | Float of span * float
  | String of span * string
  | Symbol of span * string
  | Keyword of span * string
  | List of span * expr list
  | Vector of span * expr list
  | Map of span * (expr * expr) list

type diagnostic = { span : span option; code : string; message : string }

let json_escape input =
  let buffer = Buffer.create (String.length input + 16) in
  String.iter
    (function
      | '"' -> Buffer.add_string buffer "\\\""
      | '\\' -> Buffer.add_string buffer "\\\\"
      | '\b' -> Buffer.add_string buffer "\\b"
      | '\012' -> Buffer.add_string buffer "\\f"
      | '\n' -> Buffer.add_string buffer "\\n"
      | '\r' -> Buffer.add_string buffer "\\r"
      | '\t' -> Buffer.add_string buffer "\\t"
      | c when Char.code c < 0x20 ->
          Buffer.add_string buffer (Printf.sprintf "\\u%04x" (Char.code c))
      | c -> Buffer.add_char buffer c)
    input;
  Buffer.contents buffer

let string_json value = Printf.sprintf "\"%s\"" (json_escape value)

let span source_id start_offset end_offset =
  { source_id; start_offset; end_offset }

let expr_span = function
  | Nil span
  | Bool (span, _)
  | Int (span, _)
  | Float (span, _)
  | String (span, _)
  | Symbol (span, _)
  | Keyword (span, _)
  | List (span, _)
  | Vector (span, _)
  | Map (span, _) ->
      span

let span_to_json span =
  Printf.sprintf "{\"sourceId\":%s,\"startOffset\":%d,\"endOffset\":%d}"
    (string_json span.source_id)
    span.start_offset span.end_offset

let rec expr_to_json expr =
  let span = expr_span expr in
  let base kind fields =
    let all_fields =
      [
        Printf.sprintf "\"kind\":%s" (string_json kind);
        Printf.sprintf "\"span\":%s" (span_to_json span);
      ]
      @ fields
    in
    Printf.sprintf "{%s}" (String.concat "," all_fields)
  in
  match expr with
  | Nil _ -> base "nil" []
  | Bool (_, value) ->
      base "bool" [ Printf.sprintf "\"value\":%s" (string_of_bool value) ]
  | Int (_, value) -> base "int" [ Printf.sprintf "\"value\":%d" value ]
  | Float (_, value) ->
      base "float" [ Printf.sprintf "\"value\":%s" (string_of_float value) ]
  | String (_, value) ->
      base "string" [ Printf.sprintf "\"value\":%s" (string_json value) ]
  | Symbol (_, value) ->
      base "symbol" [ Printf.sprintf "\"value\":%s" (string_json value) ]
  | Keyword (_, value) ->
      base "keyword" [ Printf.sprintf "\"value\":%s" (string_json value) ]
  | List (_, items) ->
      base "list"
        [
          Printf.sprintf "\"items\":[%s]"
            (String.concat "," (List.map expr_to_json items));
        ]
  | Vector (_, items) ->
      base "vector"
        [
          Printf.sprintf "\"items\":[%s]"
            (String.concat "," (List.map expr_to_json items));
        ]
  | Map (_, entries) ->
      let entry_to_json (key, value) =
        Printf.sprintf "{\"key\":%s,\"value\":%s}" (expr_to_json key)
          (expr_to_json value)
      in
      base "map"
        [
          Printf.sprintf "\"entries\":[%s]"
            (String.concat "," (List.map entry_to_json entries));
        ]

let diagnostic_to_json diagnostic =
  let span_json =
    match diagnostic.span with None -> "null" | Some span -> span_to_json span
  in
  Printf.sprintf
    "{\"span\":%s,\"severity\":\"error\",\"code\":%s,\"message\":%s,\"notes\":[],\"fixes\":[]}"
    span_json
    (string_json diagnostic.code)
    (string_json diagnostic.message)
