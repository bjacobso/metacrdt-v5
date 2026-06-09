type form = { index : int; span : Ast.span; digest : string }
type snapshot = { source_id : string; forms : form list }

let digest text = Digest.to_hex (Digest.string text)

let rec shape_json = function
  | Ast.Nil _ -> "{\"kind\":\"nil\"}"
  | Ast.Bool (_, value) ->
      Printf.sprintf "{\"kind\":\"bool\",\"value\":%s}" (string_of_bool value)
  | Ast.Int (_, value) -> Printf.sprintf "{\"kind\":\"int\",\"value\":%d}" value
  | Ast.Float (_, value) ->
      Printf.sprintf "{\"kind\":\"float\",\"value\":%s}" (string_of_float value)
  | Ast.String (_, value) ->
      Printf.sprintf "{\"kind\":\"string\",\"value\":%s}"
        (Value.string_json value)
  | Ast.Symbol (_, value) ->
      Printf.sprintf "{\"kind\":\"symbol\",\"value\":%s}"
        (Value.string_json value)
  | Ast.Keyword (_, value) ->
      Printf.sprintf "{\"kind\":\"keyword\",\"value\":%s}"
        (Value.string_json value)
  | Ast.List (_, values) ->
      Printf.sprintf "{\"kind\":\"list\",\"items\":[%s]}"
        (String.concat "," (List.map shape_json values))
  | Ast.Vector (_, values) ->
      Printf.sprintf "{\"kind\":\"vector\",\"items\":[%s]}"
        (String.concat "," (List.map shape_json values))
  | Ast.Map (_, entries) ->
      let entry_json (key, value) =
        Printf.sprintf "{\"key\":%s,\"value\":%s}" (shape_json key)
          (shape_json value)
      in
      Printf.sprintf "{\"kind\":\"map\",\"entries\":[%s]}"
        (String.concat "," (List.map entry_json entries))

let form index expr =
  { index; span = Ast.expr_span expr; digest = digest (shape_json expr) }

let snapshot ~source_id exprs = { source_id; forms = List.mapi form exprs }

let span_json span =
  Printf.sprintf "{\"sourceId\":%s,\"startOffset\":%d,\"endOffset\":%d}"
    (Value.string_json span.Ast.source_id)
    span.start_offset span.end_offset

let form_json form =
  Printf.sprintf "{\"index\":%d,\"span\":%s,\"digest\":%s}" form.index
    (span_json form.span)
    (Value.string_json form.digest)

let snapshot_json snapshot =
  Printf.sprintf "{\"sourceId\":%s,\"formCount\":%d,\"forms\":[%s]}"
    (Value.string_json snapshot.source_id)
    (List.length snapshot.forms)
    (String.concat "," (List.map form_json snapshot.forms))
