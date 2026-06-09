type diagnostic = Lower_common.diagnostic = {
  span : Ast.span option;
  code : string;
  message : string;
}

let diagnostic = Lower_common.diagnostic
let mk_node expr = Core_ast.node (Ast.expr_span expr)

let lower_pattern = function
  | Ast.Symbol (_, "_") -> Ok Core_ast.PWild
  | Ast.Symbol (_, name) | Ast.Keyword (_, name) ->
      Ok (Core_ast.PCon (name, []))
  | Ast.List (_, Ast.Symbol (_, name) :: vars)
  | Ast.Vector (_, Ast.Symbol (_, name) :: vars) ->
      let rec loop acc = function
        | [] -> Ok (Core_ast.PCon (name, List.rev acc))
        | Ast.Symbol (_, var) :: rest -> loop (var :: acc) rest
        | bad :: _ ->
            Error
              [
                diagnostic ~span:(Ast.expr_span bad) "lower/match-pattern"
                  "Constructor pattern bindings must be symbols.";
              ]
      in
      loop [] vars
  | bad ->
      Error
        [
          diagnostic ~span:(Ast.expr_span bad) "lower/match-pattern"
            "Unsupported match pattern.";
        ]

let lower_match lower_expr expr args =
  let rec lower_match_arms acc = function
    | [] -> Ok (List.rev acc)
    | pattern_expr :: body_expr :: rest -> (
        match (lower_pattern pattern_expr, lower_expr body_expr) with
        | Error diagnostics, _ | _, Error diagnostics -> Error diagnostics
        | Ok pattern, Ok body ->
            lower_match_arms (Core_ast.{ pattern; body } :: acc) rest)
    | _ -> assert false
  in
  match args with
  | scrutinee :: arms when arms <> [] && List.length arms mod 2 = 0 -> (
      match lower_expr scrutinee with
      | Error _ as error -> error
      | Ok scrutinee -> (
          match lower_match_arms [] arms with
          | Error _ as error -> error
          | Ok arms -> Ok (Core_ast.Match (mk_node expr, scrutinee, arms))))
  | _ ->
      Error
        [
          diagnostic ~span:(Ast.expr_span expr) "lower/match"
            "match expects a scrutinee and pattern/body pairs.";
        ]
