type declaration = Packageable_declaration.t
type package_declaration = Artifact_types.package_declaration

val package_declarations :
  (string, Source.t) Hashtbl.t ->
  declaration list ->
  (package_declaration list, Diagnostic.t list) result
