type severity = Error | Warning | Info
type note = { span : Cst.span option; message : string }
type fix = { span : Cst.span; replacement : string; message : string option }

type t = {
  span : Cst.span;
  severity : severity;
  code : string;
  message : string;
  path : string option;
  notes : note list;
  fixes : fix list;
}

let error ?path ~span ~code ~message () =
  { span; severity = Error; code; message; path; notes = []; fixes = [] }

let severity_json = function
  | Error -> "error"
  | Warning -> "warning"
  | Info -> "info"

let span_ir_json (span : Cst.span) =
  Ir_json.Object
    [
      ("sourceId", Ir_json.String span.source_id);
      ("startOffset", Ir_json.Int span.start_offset);
      ("endOffset", Ir_json.Int span.end_offset);
    ]

let note_to_ir_json (note : note) =
  Ir_json.Object
    [
      ( "span",
        match note.span with
        | None -> Ir_json.Null
        | Some span -> span_ir_json span );
      ("message", Ir_json.String note.message);
    ]

let fix_to_ir_json (fix : fix) =
  Ir_json.Object
    [
      ("span", span_ir_json fix.span);
      ("replacement", Ir_json.String fix.replacement);
      ( "message",
        match fix.message with
        | None -> Ir_json.Null
        | Some message -> Ir_json.String message );
    ]

let to_ir_json (diagnostic : t) =
  let core_fields =
    [
      ("span", span_ir_json diagnostic.span);
      ("severity", Ir_json.String (severity_json diagnostic.severity));
      ("code", Ir_json.String diagnostic.code);
      ("message", Ir_json.String diagnostic.message);
      ("notes", Ir_json.Array (List.map note_to_ir_json diagnostic.notes));
      ("fixes", Ir_json.Array (List.map fix_to_ir_json diagnostic.fixes));
    ]
  in
  let fields =
    match diagnostic.path with
    | None -> core_fields
    | Some path ->
        [
          ("span", span_ir_json diagnostic.span);
          ("severity", Ir_json.String (severity_json diagnostic.severity));
          ("code", Ir_json.String diagnostic.code);
          ("message", Ir_json.String diagnostic.message);
          ("path", Ir_json.String path);
          ("notes", Ir_json.Array (List.map note_to_ir_json diagnostic.notes));
          ("fixes", Ir_json.Array (List.map fix_to_ir_json diagnostic.fixes));
        ]
  in
  Ir_json.Object fields

let to_json diagnostic = Ir_json.to_string (to_ir_json diagnostic)
