type declaration = Packageable_declaration.t
type package_declaration = Artifact_types.package_declaration

let position_manifest source span =
  match source with
  | Some source ->
      let start_position =
        Source.position_at_offset source span.Ast.start_offset
      in
      let end_position = Source.position_at_offset source span.Ast.end_offset in
      Artifact_types.make_provenance_span ~start_offset:span.start_offset
        ~end_offset:span.end_offset ~start_line:(Some start_position.line)
        ~start_column:(Some start_position.column)
        ~end_line:(Some end_position.line)
        ~end_column:(Some end_position.column)
  | None ->
      Artifact_types.make_provenance_span ~start_offset:span.start_offset
        ~end_offset:span.end_offset ~start_line:None ~start_column:None
        ~end_line:None ~end_column:None

let provenance sources declaration_index (declaration : declaration) =
  Artifact_types.make_declaration_provenance ~declaration_index
    ~source_id:(Packageable_declaration.source_id declaration)
    ~form_index:(Packageable_declaration.form_index declaration)
    ~span:
      (position_manifest
         (Hashtbl.find_opt sources
            (Packageable_declaration.source_id declaration))
         (Packageable_declaration.span declaration))

let package_declarations sources (declarations : declaration list) =
  let rec loop acc index = function
    | [] -> Ok (List.rev acc)
    | (declaration : declaration) :: rest ->
        loop
          (Artifact_types.make_package_declaration
             ~value:
               (Packageable_declaration.payload_value
                  (Packageable_declaration.payload declaration))
             ~provenance:(provenance sources index declaration)
             ~type_summary:(Packageable_declaration.summary declaration)
          :: acc)
          (index + 1) rest
  in
  loop [] 0 declarations
