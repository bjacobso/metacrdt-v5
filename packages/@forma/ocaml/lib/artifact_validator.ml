type payload = { name : string; index : int; span : Ast.span; value : Value.t }

let make_payload ~name ~index ~span ~value = { name; index; span; value }
let payload_name payload = payload.name
let payload_index payload = payload.index
let payload_span payload = payload.span
let payload_value payload = payload.value

type spec = { name : string; validate : payload list -> Diagnostic.t list }

let make_spec ~name ~validate = { name; validate }
let spec_name spec = spec.name
let validate_spec spec payloads = spec.validate payloads

let diagnostic payload ~code ~message =
  Diagnostic.error
    ~path:
      (Printf.sprintf "$.declarations[%d].validators.%s" payload.index
         payload.name)
    ~span:payload.span ~code ~message ()
