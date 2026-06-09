let normalize_name name =
  if String.length name > 0 && name.[0] = ':' then
    String.sub name 1 (String.length name - 1)
  else name

let validators_value = function
  | Value.VMap entries ->
      List.find_map
        (function
          | (Value.VKeyword key | Value.VString key | Value.VSymbol key), value
            when normalize_name key = "validators" ->
              Some value
          | _ -> None)
        entries
  | _ -> None

let validator_name form_name acc value =
  match Descriptor.value_text value with
  | Some name -> (
      match normalize_name name with
      | "" ->
          Error
            (Printf.sprintf
               "Descriptor artifact validators for form %S must not be empty."
               form_name)
      | name when List.mem name acc ->
          Error
            (Printf.sprintf
               "Descriptor artifact validators for form %S must not repeat \
                validator %S."
               form_name name)
      | name -> Ok name)
  | None ->
      Error
        (Printf.sprintf
           "Descriptor artifact validators for form %S must be textual."
           form_name)

let validator_name_list form_name values =
  let rec loop acc = function
    | [] -> Ok (List.rev acc)
    | value :: rest -> (
        match validator_name form_name acc value with
        | Ok name -> loop (name :: acc) rest
        | Error _ as error -> error)
  in
  loop [] values

let names_of_form (form : Descriptor.form) =
  match Descriptor.extension_in_form form "artifact" with
  | None -> Ok []
  | Some artifact -> (
      match validators_value artifact with
      | None -> Ok []
      | Some (Value.VList values | Value.VVector values) ->
          validator_name_list form.name values
      | Some value -> (
          match validator_name form.name [] value with
          | Ok name -> Ok [ name ]
          | Error _ ->
              Error
                (Printf.sprintf
                   "Descriptor artifact validators for form %S must be a \
                    textual value or list."
                   form.name)))

let names env form_name =
  match Descriptor.form env form_name with
  | None -> Ok []
  | Some form -> names_of_form form
