let value name operations =
  Value.VMap
    [
      (Value.VKeyword ":kind", Value.VString "effect");
      (Value.VKeyword ":name", Value.VString name);
      ( Value.VKeyword ":operations",
        Value.VVector (List.map (fun op -> Value.VString op) operations) );
    ]

let kind entries =
  match Value.lookup_map entries (Value.VKeyword ":kind") with
  | Some (Value.VString "effect") -> true
  | _ -> false

let name entries =
  match Value.lookup_map entries (Value.VKeyword ":name") with
  | Some (Value.VString name) -> Some name
  | _ -> None

let operations entries =
  match Value.lookup_map entries (Value.VKeyword ":operations") with
  | Some (Value.VVector operations) ->
      operations
      |> List.filter_map (function
        | Value.VString name -> Some name
        | _ -> None)
      |> Option.some
  | _ -> None

let lookup_effect_name env op_name =
  Env.bindings env
  |> List.find_map (fun (_, value) ->
      match value with
      | Value.VMap entries when kind entries -> (
          match (name entries, operations entries) with
          | Some effect_name, Some operations
            when List.exists (( = ) op_name) operations ->
              Some effect_name
          | _ -> None)
      | _ -> None)
