type package_declaration = Artifact_types.package_declaration
type package_summary = Artifact_summary_types.package_summary

let package_type_summary (declarations : package_declaration list) =
  let counts = Hashtbl.create 8 in
  declarations
  |> List.iter (fun (declaration : package_declaration) ->
      let result_type =
        Artifact_summary_types.declaration_summary_result_type
          (Artifact_types.package_declaration_type_summary declaration)
      in
      let count =
        match Hashtbl.find_opt counts result_type with
        | Some count -> count
        | None -> 0
      in
      Hashtbl.replace counts result_type (count + 1));
  Artifact_summary_types.make_package_summary
    ~declaration_count:(List.length declarations)
    ~result_types:
      (Hashtbl.fold (fun key _ keys -> key :: keys) counts []
      |> List.sort String.compare
      |> List.map (fun result_type ->
          (result_type, Hashtbl.find counts result_type)))
