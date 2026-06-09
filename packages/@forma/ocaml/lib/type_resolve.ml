open Type_expr

let diagnostic = Type_diagnostic.make

let uppercase_initial name =
  String.length name > 0
  &&
  let first = name.[0] in
  Char.uppercase_ascii first = first && Char.lowercase_ascii first <> first

let make_type_application callee args =
  match (callee, args) with
  | TNamed "List", [ item ] -> Ok (TList item)
  | TNamed "Vector", [ item ] -> Ok (TVector item)
  | TNamed "Map", _ -> Ok TMap
  | TNamed name, args -> Ok (TNamedApp (name, args))
  | _ -> Ok (TApp (callee, args))

let rec resolve env = function
  | Core_ast.TESym (_, name) -> (
      match name with
      | "Int" | "Num" -> Ok TInt
      | "Float" -> Ok TFloat
      | "Bool" -> Ok TBool
      | "Str" | "String" -> Ok TString
      | "Nil" | "Unit" -> Ok TNil
      | "Keyword" -> Ok TKeyword
      | "Symbol" -> Ok TSymbol
      | "Syntax" -> Ok TSyntax
      | "Any" | "_" -> Ok TAny
      | name -> (
          match Type_env.lookup name env with
          | Some ty -> Ok ty
          | None when uppercase_initial name -> Ok (TNamed name)
          | None ->
              Error
                [
                  diagnostic "typecheck/unknown-type"
                    (Printf.sprintf "Unknown type %S." name);
                ]))
  | Core_ast.TEFun (_, params, result) -> (
      match (resolve_many env params, resolve env result) with
      | Error diagnostics, _ | _, Error diagnostics -> Error diagnostics
      | Ok params, Ok result -> Ok (TFn (params, result)))
  | Core_ast.TEApp
      (span, Core_ast.TESym (_, (("List" | "Vector") as name)), args)
    when List.length args <> 1 ->
      Error
        [
          diagnostic ~span "typecheck/kind-mismatch"
            (Printf.sprintf "%s expects exactly one type argument." name);
        ]
  | Core_ast.TEApp
      (_, Core_ast.TESym (_, (("ErrorSet" | "RequirementSet") as name)), args)
    ->
      let item = function
        | Core_ast.TESym (_, item_name) -> Ok (TNamed item_name)
        | other -> resolve env other
      in
      let rec loop acc = function
        | [] -> Ok (TNamedApp (name, List.rev acc))
        | arg :: rest -> (
            match item arg with
            | Error _ as error -> error
            | Ok typ -> loop (typ :: acc) rest)
      in
      loop [] args
  | Core_ast.TEApp (_, callee, args) -> (
      match (resolve env callee, resolve_many env args) with
      | Error diagnostics, _ | _, Error diagnostics -> Error diagnostics
      | Ok callee, Ok args -> make_type_application callee args)
  | Core_ast.TERow (_, fields, None) -> resolve_record_type_fields env fields
  | Core_ast.TERow (span, _, Some _) ->
      Error
        [
          diagnostic ~span "typecheck/unsupported-type"
            "Open row type expressions are not supported yet.";
        ]

and resolve_many env exprs =
  let rec loop acc = function
    | [] -> Ok (List.rev acc)
    | expr :: rest -> (
        match resolve env expr with
        | Error _ as error -> error
        | Ok typ -> loop (typ :: acc) rest)
  in
  loop [] exprs

and resolve_record_type_fields env fields =
  let rec loop acc = function
    | [] -> Ok (TRecord (sort_record_fields (List.rev acc)))
    | (label, expr) :: rest -> (
        match resolve env expr with
        | Error _ as error -> error
        | Ok typ -> loop ((label, typ) :: acc) rest)
  in
  loop [] fields
