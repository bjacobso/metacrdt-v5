type t = { span : Ast.span option; code : string; message : string }

let string_json = Value.string_json
let make ?span code message = { span; code; message }

let with_span span diagnostics =
  List.map
    (fun diagnostic ->
      match diagnostic.span with
      | Some _ -> diagnostic
      | None -> { diagnostic with span = Some span })
    diagnostics

let to_json diagnostic =
  match diagnostic.span with
  | Some span ->
      Diagnostic.to_json
        (Diagnostic.error ~span ~code:diagnostic.code
           ~message:diagnostic.message ())
  | None ->
      Printf.sprintf
        "{\"span\":null,\"severity\":\"error\",\"code\":%s,\"message\":%s,\"notes\":[],\"fixes\":[]}"
        (string_json diagnostic.code)
        (string_json diagnostic.message)
