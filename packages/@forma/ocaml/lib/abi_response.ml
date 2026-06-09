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

let string_field name value =
  Printf.sprintf "\"%s\":\"%s\"" name (json_escape value)

let null_json = "{\"ok\":true,\"value\":null}"

let object_json fields =
  Printf.sprintf "{\"ok\":true,\"value\":{%s}}" (String.concat "," fields)

let diagnostic_json ~code ~message =
  Printf.sprintf
    "{\"span\":null,\"severity\":\"error\",%s,%s,\"notes\":[],\"fixes\":[]}"
    (string_field "code" code)
    (string_field "message" message)

let error_json diagnostics =
  Printf.sprintf "{\"ok\":false,\"diagnostics\":[%s]}"
    (String.concat "," diagnostics)

let error_diagnostics_json diagnostics =
  Ir_json.to_string
    (Ir_json.Object
       [
         ("ok", Ir_json.Bool false);
         ( "diagnostics",
           Ir_json.Array (List.map Diagnostic.to_ir_json diagnostics) );
       ])

let reader_diagnostics_json diagnostics =
  error_json (List.map Reader.diagnostic_to_json diagnostics)

let eval_diagnostics_json diagnostics =
  error_json (List.map Eval.diagnostic_to_json diagnostics)

let typecheck_diagnostics_json diagnostics =
  error_json (List.map Type_diagnostic.to_json diagnostics)

let lower_diagnostics_json diagnostics =
  error_json (List.map Lower.diagnostic_to_json diagnostics)

let eval_diagnostics_array diagnostics =
  Printf.sprintf "[%s]"
    (String.concat "," (List.map Eval.diagnostic_to_json diagnostics))

let diagnostic_array diagnostics =
  Ir_json.to_string (Ir_json.Array (List.map Diagnostic.to_ir_json diagnostics))

let ast_exprs_json exprs =
  Printf.sprintf "[%s]" (String.concat "," (List.map Ast.expr_to_json exprs))
