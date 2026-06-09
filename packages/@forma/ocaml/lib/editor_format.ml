type options = { soft_wrap : int; indent_size : int }

let default_options = { soft_wrap = 80; indent_size = 2 }

let escape_string input =
  let buffer = Buffer.create (String.length input + 16) in
  String.iter
    (function
      | '"' -> Buffer.add_string buffer "\\\""
      | '\\' -> Buffer.add_string buffer "\\\\"
      | '\n' -> Buffer.add_string buffer "\\n"
      | c -> Buffer.add_char buffer c)
    input;
  Buffer.contents buffer

let rec flat = function
  | Ast.Nil _ -> "nil"
  | Ast.Bool (_, value) -> string_of_bool value
  | Ast.Int (_, value) -> string_of_int value
  | Ast.Float (_, value) -> string_of_float value
  | Ast.String (_, value) -> Printf.sprintf "\"%s\"" (escape_string value)
  | Ast.Symbol (_, value) | Ast.Keyword (_, value) -> value
  | Ast.List (_, items) ->
      Printf.sprintf "(%s)" (String.concat " " (List.map flat items))
  | Ast.Vector (_, items) ->
      Printf.sprintf "[%s]" (String.concat " " (List.map flat items))
  | Ast.Map (_, entries) ->
      let entry (key, value) = Printf.sprintf "%s %s" (flat key) (flat value) in
      Printf.sprintf "{%s}" (String.concat " " (List.map entry entries))

let rec format_expr options indent expr =
  let one_line = flat expr in
  if indent + String.length one_line <= options.soft_wrap then
    String.make indent ' ' ^ one_line
  else
    match expr with
    | Ast.List (_, []) -> String.make indent ' ' ^ "()"
    | Ast.List (_, head :: rest) ->
        let child_indent = indent + options.indent_size in
        let lines =
          (String.make indent ' ' ^ "(" ^ flat head)
          :: List.map (format_expr options child_indent) rest
        in
        close_last ")" lines
    | Ast.Vector (_, []) -> String.make indent ' ' ^ "[]"
    | Ast.Vector (_, items) ->
        let child_indent = indent + options.indent_size in
        close_last "]"
          ((String.make indent ' ' ^ "[")
          :: List.map (format_expr options child_indent) items)
    | Ast.Map (_, []) -> String.make indent ' ' ^ "{}"
    | Ast.Map (_, entries) ->
        let child_indent = indent + options.indent_size in
        let entry_lines (key, value) =
          let key_text = flat key in
          let value_text = flat value in
          if
            child_indent + String.length key_text + 1 + String.length value_text
            <= options.soft_wrap
          then [ String.make child_indent ' ' ^ key_text ^ " " ^ value_text ]
          else
            [
              String.make child_indent ' ' ^ key_text;
              format_expr options (child_indent + options.indent_size) value;
            ]
        in
        close_last "}"
          ((String.make indent ' ' ^ "{") :: List.concat_map entry_lines entries)
    | Ast.Nil _ | Ast.Bool _ | Ast.Int _ | Ast.Float _ | Ast.String _
    | Ast.Symbol _ | Ast.Keyword _ ->
        String.make indent ' ' ^ one_line

and close_last suffix = function
  | [] -> suffix
  | lines ->
      let rec loop acc = function
        | [] -> List.rev acc
        | [ last ] -> List.rev ((last ^ suffix) :: acc)
        | line :: rest -> loop (line :: acc) rest
      in
      String.concat "\n" (loop [] lines)

let format_program ?(options = default_options) exprs =
  match exprs with
  | [] -> ""
  | _ -> String.concat "\n" (List.map (format_expr options 0) exprs) ^ "\n"
