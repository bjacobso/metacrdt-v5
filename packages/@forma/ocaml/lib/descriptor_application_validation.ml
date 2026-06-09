type diagnostic = Descriptor_validation.diagnostic = {
  span : Ast.span option;
  code : string;
  message : string;
}

type slot = { name : string; aliases : string list }
type form = { name : string; slots : slot list }

let diagnostic ?span code message = { span; code; message }

let strip_slot_prefix name =
  if String.length name > 0 && name.[0] = ':' then
    String.sub name 1 (String.length name - 1)
  else name

let format_slot_name name =
  if String.length name > 0 && name.[0] = ':' then name else ":" ^ name

let edit_distance left right =
  let left_length = String.length left in
  let right_length = String.length right in
  let previous = Array.init (right_length + 1) Fun.id in
  let current = Array.make (right_length + 1) 0 in
  for left_index = 1 to left_length do
    current.(0) <- left_index;
    for right_index = 1 to right_length do
      let substitution_cost =
        if left.[left_index - 1] = right.[right_index - 1] then 0 else 1
      in
      current.(right_index) <-
        min
          (min (previous.(right_index) + 1) (current.(right_index - 1) + 1))
          (previous.(right_index - 1) + substitution_cost)
    done;
    Array.blit current 0 previous 0 (right_length + 1)
  done;
  previous.(right_length)

let closest_slot_name slot_name (slots : slot list) =
  let normalized = strip_slot_prefix slot_name in
  let candidates =
    slots
    |> List.concat_map (fun (slot : slot) -> slot.name :: slot.aliases)
    |> List.map strip_slot_prefix
  in
  let best =
    candidates
    |> List.fold_left
         (fun best candidate ->
           let distance = edit_distance normalized candidate in
           match best with
           | None -> Some (candidate, distance)
           | Some (_, best_distance) when distance < best_distance ->
               Some (candidate, distance)
           | Some _ -> best)
         None
  in
  match best with
  | None -> None
  | Some (candidate, distance) ->
      let threshold =
        max 2 (max (String.length normalized) (String.length candidate) / 3)
      in
      if distance <= threshold then Some candidate else None

let slot_matches name (slot : slot) =
  let normalized = strip_slot_prefix name in
  strip_slot_prefix slot.name = normalized
  || List.exists
       (fun alias -> strip_slot_prefix alias = normalized)
       slot.aliases

let keyword_head_slot = function
  | Reader.List (_, Reader.Keyword (_, name) :: _)
  | Reader.Vector (_, Reader.Keyword (_, name) :: _) ->
      Some name
  | _ -> None

let unknown_slot_diagnostic (form : form) slot_name expr =
  let suggestion =
    match closest_slot_name slot_name form.slots with
    | Some name -> Printf.sprintf " Did you mean '%s'?" (format_slot_name name)
    | None -> ""
  in
  diagnostic ~span:(Ast.expr_span expr) "descriptor/unknown-slot"
    (Printf.sprintf "Unknown slot '%s' in form '%s'.%s"
       (format_slot_name slot_name) form.name suggestion)

let validate_slots (form : form) args =
  let rec loop diagnostics = function
    | [] -> if diagnostics = [] then Ok () else Error (List.rev diagnostics)
    | arg :: rest -> (
        match keyword_head_slot arg with
        | None -> loop diagnostics rest
        | Some slot_name ->
            if List.exists (slot_matches slot_name) form.slots then
              loop diagnostics rest
            else
              loop (unknown_slot_diagnostic form slot_name arg :: diagnostics) rest)
  in
  loop [] args
