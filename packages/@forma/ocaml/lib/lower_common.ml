type diagnostic = { span : Ast.span option; code : string; message : string }

let string_json = Value.string_json
let diagnostic ?span code message = { span; code; message }

let span_to_json span =
  Printf.sprintf "{\"sourceId\":%s,\"startOffset\":%d,\"endOffset\":%d}"
    (string_json span.Ast.source_id)
    span.start_offset span.end_offset

let diagnostic_to_json (diagnostic : diagnostic) =
  let span_json =
    match diagnostic.span with None -> "null" | Some span -> span_to_json span
  in
  Printf.sprintf
    "{\"span\":%s,\"severity\":\"error\",\"code\":%s,\"message\":%s,\"notes\":[],\"fixes\":[]}"
    span_json
    (string_json diagnostic.code)
    (string_json diagnostic.message)
