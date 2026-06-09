type t =
  | Null
  | Bool of bool
  | Int of int
  | Float of float
  | String of string
  | Array of t list
  | Object of (string * t) list
  | Map of (t * t) list

let json_escape input =
  let buffer = Buffer.create (String.length input + 16) in
  String.iter
    (function
      | '"' -> Buffer.add_string buffer "\\\""
      | '\\' -> Buffer.add_string buffer "\\\\"
      | '\b' -> Buffer.add_string buffer "\\b"
      | '\012' -> Buffer.add_string buffer "\\f"
      | '\n' -> Buffer.add_string buffer "\\n"
      | '\r' -> Buffer.add_string buffer "\\r"
      | '\t' -> Buffer.add_string buffer "\\t"
      | c when Char.code c < 0x20 ->
          Buffer.add_string buffer (Printf.sprintf "\\u%04x" (Char.code c))
      | c -> Buffer.add_char buffer c)
    input;
  Buffer.contents buffer

let string value = Printf.sprintf "\"%s\"" (json_escape value)

let rec to_string = function
  | Null -> "null"
  | Bool value -> if value then "true" else "false"
  | Int value -> string_of_int value
  | Float value -> string_of_float value
  | String value -> string value
  | Array values ->
      Printf.sprintf "[%s]" (String.concat "," (List.map to_string values))
  | Object entries ->
      let entry_to_string (key, value) =
        Printf.sprintf "%s:%s" (string key) (to_string value)
      in
      Printf.sprintf "{%s}"
        (String.concat "," (List.map entry_to_string entries))
  | Map entries ->
      let entry_to_string (key, value) =
        Printf.sprintf "{\"key\":%s,\"value\":%s}" (to_string key)
          (to_string value)
      in
      Printf.sprintf "{\"$map\":[%s]}"
        (String.concat "," (List.map entry_to_string entries))
