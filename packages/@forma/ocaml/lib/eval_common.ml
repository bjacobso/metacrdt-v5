type diagnostic = { span : Ast.span option; code : string; message : string }

let diagnostic ?span code message = { span; code; message }

let with_span span diagnostics =
  List.map
    (fun diagnostic ->
      match diagnostic.span with
      | Some _ -> diagnostic
      | None -> { diagnostic with span = Some span })
    diagnostics
