let value_text = function
  | Value.VString value | Value.VSymbol value | Value.VKeyword value ->
      Some value
  | _ -> None

let normalize_name name =
  if String.length name > 0 && name.[0] = ':' then
    String.sub name 1 (String.length name - 1)
  else name

let is_entry = function
  | Value.VList (Value.VKeyword _ :: _) | Value.VVector (Value.VKeyword _ :: _)
    ->
      true
  | _ -> false

let rec merge_value left right =
  match (left, right) with
  | Value.VMap left_entries, Value.VMap right_entries ->
      Value.VMap (merge_entries left_entries right_entries)
  | _ -> right

and merge_entries left right =
  List.fold_left
    (fun entries (key, value) ->
      let merged_value =
        match Value.lookup_map entries key with
        | Some current -> merge_value current value
        | None -> value
      in
      let same_key left_key =
        Value.equal left_key key
        ||
        match (value_text left_key, value_text key) with
        | Some left_name, Some right_name ->
            normalize_name left_name = normalize_name right_name
        | _ -> false
      in
      (key, merged_value)
      :: List.filter
           (fun (existing_key, _) -> not (same_key existing_key))
           entries)
    left right

and normalize_value = function
  | Value.VList (Value.VKeyword key :: values)
  | Value.VVector (Value.VKeyword key :: values) ->
      let value =
        match values with
        | [ value ] when not (is_entry value) -> normalize_value value
        | values when List.for_all is_entry values ->
            Value.VMap (normalize_entries values)
        | values -> Value.VList (List.map normalize_scalar_value values)
      in
      Value.VMap [ (Value.VKeyword key, value) ]
  | value -> normalize_scalar_value value

and normalize_scalar_value = function
  | Value.VList values -> Value.VList (List.map normalize_scalar_value values)
  | Value.VVector values ->
      Value.VVector (List.map normalize_scalar_value values)
  | Value.VMap entries ->
      Value.VMap
        (List.map
           (fun (key, value) -> (key, normalize_scalar_value value))
           entries)
  | value -> value

and normalize_entries entries =
  entries
  |> List.fold_left
       (fun acc entry ->
         match normalize_value entry with
         | Value.VMap normalized_entries -> merge_entries acc normalized_entries
         | _ -> acc)
       []

let from_clauses clauses =
  clauses
  |> List.filter_map (function
    | Value.VList (Value.VKeyword ":extensions" :: extensions)
    | Value.VVector (Value.VKeyword ":extensions" :: extensions) ->
        Some
          (extensions
          |> List.filter_map (function
            | Value.VList (Value.VKeyword key :: entries)
            | Value.VVector (Value.VKeyword key :: entries) ->
                Some (normalize_name key, Value.VMap (normalize_entries entries))
            | _ -> None))
    | _ -> None)
  |> List.concat
  |> List.fold_left
       (fun acc (key, value) ->
         let merged =
           match List.assoc_opt key acc with
           | Some current -> merge_value current value
           | None -> value
         in
         (key, merged) :: List.remove_assoc key acc)
       []

let find extensions key = List.assoc_opt (normalize_name key) extensions
