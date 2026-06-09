let json_escape = Value.json_escape

let string_field name value =
  Printf.sprintf "\"%s\":\"%s\"" name (json_escape value)

let diagnostic_json ~code ~message =
  Printf.sprintf
    "{\"span\":null,\"severity\":\"error\",%s,%s,\"notes\":[],\"fixes\":[]}"
    (string_field "code" code)
    (string_field "message" message)

let error_json diagnostics =
  Printf.sprintf "{\"ok\":false,\"diagnostics\":[%s]}"
    (String.concat "," diagnostics)

let summary_json source_id source =
  match source with
  | None ->
      error_json
        [
          diagnostic_json ~code:"abi/missing-source"
            ~message:"incrementalSummary requires a source string field.";
        ]
  | Some source -> (
      let source_id =
        match source_id with Some id -> id | None -> "request"
      in
      match Reader.parse_ast ~source_id source with
      | Error diagnostics ->
          Printf.sprintf "{\"ok\":false,\"diagnostics\":[%s]}"
            (String.concat "," (List.map Cst.diagnostic_to_json diagnostics))
      | Ok exprs ->
          let snapshot = Incremental.snapshot ~source_id exprs in
          Printf.sprintf "{\"ok\":true,\"value\":%s}"
            (Incremental.snapshot_json snapshot))
