let is_ws = function ' ' | '\n' | '\r' | '\t' -> true | _ -> false

let skip_ws json =
  let len = String.length json in
  let rec loop i = if i < len && is_ws json.[i] then loop (i + 1) else i in
  loop

let find_literal literal json start =
  let len = String.length json in
  let literal_len = String.length literal in
  let rec loop i =
    if i + literal_len > len then None
    else if String.sub json i literal_len = literal then Some (i + literal_len)
    else loop (i + 1)
  in
  loop start

let find_matching json ~open_char ~close_char start =
  let len = String.length json in
  let rec loop depth in_string escaped i =
    if i >= len then None
    else
      let c = json.[i] in
      if in_string then
        if escaped then loop depth true false (i + 1)
        else
          match c with
          | '\\' -> loop depth true true (i + 1)
          | '"' -> loop depth false false (i + 1)
          | _ -> loop depth true false (i + 1)
      else
        match c with
        | '"' -> loop depth true false (i + 1)
        | c when c = open_char -> loop (depth + 1) false false (i + 1)
        | c when c = close_char ->
            if depth = 1 then Some i else loop (depth - 1) false false (i + 1)
        | _ -> loop depth false false (i + 1)
  in
  if start >= len || json.[start] <> open_char then None
  else loop 1 false false (start + 1)

let find_compound_field name open_char close_char json =
  let needle = "\"" ^ name ^ "\"" in
  let rec attempt search_start =
    match find_literal needle json search_start with
    | None -> None
    | Some after_name -> (
        let colon = skip_ws json after_name in
        if colon >= String.length json || json.[colon] <> ':' then
          attempt after_name
        else
          let start = skip_ws json (colon + 1) in
          if start >= String.length json || json.[start] <> open_char then
            attempt after_name
          else
            match find_matching json ~open_char ~close_char start with
            | None -> attempt after_name
            | Some finish -> Some (String.sub json start (finish - start + 1)))
  in
  attempt 0

let find_object_field name json = find_compound_field name '{' '}' json
let find_array_field name json = find_compound_field name '[' ']' json

let split_top_level_objects array_json =
  let len = String.length array_json in
  let rec loop acc i =
    let i = skip_ws array_json i in
    if i >= len || array_json.[i] = ']' then List.rev acc
    else if array_json.[i] <> '{' then List.rev acc
    else
      match find_matching array_json ~open_char:'{' ~close_char:'}' i with
      | None -> List.rev acc
      | Some finish ->
          let item = String.sub array_json i (finish - i + 1) in
          let next = skip_ws array_json (finish + 1) in
          let next =
            if next < len && array_json.[next] = ',' then next + 1 else next
          in
          loop (item :: acc) next
  in
  loop [] 1
