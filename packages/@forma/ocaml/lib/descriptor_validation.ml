type diagnostic = { span : Ast.span option; code : string; message : string }

let diagnostic ?span code message = { span; code; message }

let hook_clause_names =
  [
    ":bindings-fn";
    ":construct-fn";
    ":result-type-fn";
    ":infer-fn";
    ":infer";
    ":check-fn";
    ":check";
  ]

let hook_clause_name = function
  | Reader.List (_, Reader.Keyword (_, name) :: _)
  | Reader.Vector (_, Reader.Keyword (_, name) :: _) ->
      if List.mem name hook_clause_names then Some name else None
  | _ -> None

let hook_clause_target = function
  | Reader.List (_, [ Reader.Keyword _; Reader.Symbol (_, name) ])
  | Reader.List (_, [ Reader.Keyword _; Reader.String (_, name) ])
  | Reader.List (_, [ Reader.Keyword _; Reader.Keyword (_, name) ])
  | Reader.Vector (_, [ Reader.Keyword _; Reader.Symbol (_, name) ])
  | Reader.Vector (_, [ Reader.Keyword _; Reader.String (_, name) ])
  | Reader.Vector (_, [ Reader.Keyword _; Reader.Keyword (_, name) ]) ->
      Some name
  | _ -> None

let validate_hook_clause clause =
  match hook_clause_name clause with
  | None -> Ok ()
  | Some name -> (
      match hook_clause_target clause with
      | Some _ -> Ok ()
      | None ->
          Error
            [
              diagnostic ~span:(Ast.expr_span clause) "descriptor/hook-clause"
                (Printf.sprintf
                   "%s expects exactly one hook symbol, string, or keyword."
                   name);
            ])

let constructed_by_clause = function
  | Reader.List (_, Reader.Keyword (_, ":constructed-by") :: target :: options)
  | Reader.Vector (_, Reader.Keyword (_, ":constructed-by") :: target :: options)
    -> (
      match target with
      | Reader.Symbol _ | Reader.String _ | Reader.Keyword _ ->
          let rec loop = function
            | [] -> Ok ()
            | [
                Reader.Keyword (_, ":child");
                (Reader.Symbol _ | Reader.String _ | Reader.Keyword _);
              ] ->
                Ok ()
            | Reader.Keyword (_, ":child")
              :: (Reader.Symbol _ | Reader.String _ | Reader.Keyword _)
              :: rest ->
                loop rest
            | bad :: _ ->
                Error
                  [
                    diagnostic ~span:(Ast.expr_span bad)
                      "descriptor/constructed-by"
                      ":constructed-by options must be keyword/value pairs; \
                       supported option is :child.";
                  ]
          in
          loop options
      | _ ->
          Error
            [
              diagnostic ~span:(Ast.expr_span target)
                "descriptor/constructed-by"
                ":constructed-by expects an elaboration symbol, string, or \
                 keyword.";
            ])
  | Reader.List (_, [ Reader.Keyword (_, ":constructed-by") ])
  | Reader.Vector (_, [ Reader.Keyword (_, ":constructed-by") ]) ->
      Error
        [
          diagnostic "descriptor/constructed-by"
            ":constructed-by expects an elaboration symbol, string, or keyword.";
        ]
  | _ -> Ok ()

let extension_entry_name = function
  | Reader.List (_, Reader.Keyword (_, name) :: _)
  | Reader.Vector (_, Reader.Keyword (_, name) :: _) ->
      Some name
  | _ -> None

let extension_clause_name = function
  | Reader.List (_, Reader.Keyword (_, name) :: _)
  | Reader.Vector (_, Reader.Keyword (_, name) :: _) ->
      Some name
  | _ -> None

let extension_entry_clauses = function
  | Reader.List (_, Reader.Keyword _ :: clauses)
  | Reader.Vector (_, Reader.Keyword _ :: clauses) ->
      Some clauses
  | _ -> None

let validate_extension_entry extension =
  match (extension_entry_name extension, extension_entry_clauses extension) with
  | None, _ ->
      Error
        [
          diagnostic ~span:(Ast.expr_span extension) "descriptor/extensions"
            "Descriptor :extensions entries must be lists or vectors beginning \
             with an extension keyword.";
        ]
  | Some _, Some clauses ->
      let rec loop = function
        | [] -> Ok ()
        | clause :: rest -> (
            match extension_clause_name clause with
            | Some _ -> loop rest
            | None ->
                Error
                  [
                    diagnostic ~span:(Ast.expr_span clause)
                      "descriptor/extensions"
                      "Descriptor extension clauses must be lists or vectors \
                       beginning with a clause keyword.";
                  ])
      in
      loop clauses
  | Some _, None -> Ok ()

let validate_extensions_clause = function
  | Reader.List (_, Reader.Keyword (_, ":extensions") :: extensions)
  | Reader.Vector (_, Reader.Keyword (_, ":extensions") :: extensions) ->
      let rec loop = function
        | [] -> Ok ()
        | extension :: rest -> (
            match validate_extension_entry extension with
            | Ok () -> loop rest
            | Error _ as error -> error)
      in
      loop extensions
  | _ -> Ok ()

let validate_form_clauses clauses =
  let rec loop = function
    | [] -> Ok ()
    | clause :: rest -> (
        match
          ( validate_hook_clause clause,
            validate_extensions_clause clause,
            constructed_by_clause clause )
        with
        | Ok (), Ok (), Ok () -> loop rest
        | Error diagnostics, _, _
        | _, Error diagnostics, _
        | _, _, Error diagnostics ->
            Error diagnostics)
  in
  loop clauses

let meta_fn_kind_clause = function
  | Reader.List (_, [ Reader.Keyword (_, ":kind"); Reader.Symbol (_, name) ])
  | Reader.List (_, [ Reader.Keyword (_, ":kind"); Reader.String (_, name) ])
  | Reader.List (_, [ Reader.Keyword (_, ":kind"); Reader.Keyword (_, name) ])
  | Reader.Vector (_, [ Reader.Keyword (_, ":kind"); Reader.Symbol (_, name) ])
  | Reader.Vector (_, [ Reader.Keyword (_, ":kind"); Reader.String (_, name) ])
  | Reader.Vector (_, [ Reader.Keyword (_, ":kind"); Reader.Keyword (_, name) ])
    ->
      Some (Ok name)
  | Reader.List (_, Reader.Keyword (_, ":kind") :: _)
  | Reader.Vector (_, Reader.Keyword (_, ":kind") :: _) ->
      Some
        (Error
           [
             diagnostic "descriptor/meta-kind"
               ":kind expects exactly one kind symbol, string, or keyword.";
           ])
  | _ -> None

let validate_meta_fn_clauses clauses =
  let rec loop = function
    | [] -> Ok ()
    | clause :: rest -> (
        match meta_fn_kind_clause clause with
        | Some (Ok _) | None -> loop rest
        | Some (Error diagnostics) ->
            Error
              (List.map
                 (fun diagnostic ->
                   match diagnostic.span with
                   | Some _ -> diagnostic
                   | None ->
                       { diagnostic with span = Some (Ast.expr_span clause) })
                 diagnostics))
  in
  loop clauses
