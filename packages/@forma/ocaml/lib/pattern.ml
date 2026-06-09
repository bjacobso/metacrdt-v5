type bindings = (string * Value.t) list

let rec match_value pattern value =
  match (pattern, value) with
  | Reader.Symbol (_, "_"), _ -> Some []
  | Reader.Symbol (_, name), value -> Some [ (name, value) ]
  | Reader.Nil _, Value.VNil -> Some []
  | Reader.Bool (_, left), Value.VBool right when left = right -> Some []
  | Reader.Int (_, left), Value.VInt right when left = right -> Some []
  | Reader.Float (_, left), Value.VFloat right when left = right -> Some []
  | Reader.String (_, left), Value.VString right when left = right -> Some []
  | Reader.Keyword (_, left), Value.VKeyword right when left = right -> Some []
  | Reader.List (_, patterns), Value.VList values
  | Reader.Vector (_, patterns), Value.VVector values
  | Reader.Vector (_, patterns), Value.VList values
  | Reader.List (_, patterns), Value.VVector values ->
      match_list patterns values
  | _ -> None

and match_list patterns values =
  if List.length patterns <> List.length values then None
  else
    let rec loop bindings patterns values =
      match (patterns, values) with
      | [], [] -> Some bindings
      | pattern :: rest_patterns, value :: rest_values -> (
          match match_value pattern value with
          | Some next_bindings ->
              loop (next_bindings @ bindings) rest_patterns rest_values
          | None -> None)
      | _ -> None
    in
    loop [] patterns values
