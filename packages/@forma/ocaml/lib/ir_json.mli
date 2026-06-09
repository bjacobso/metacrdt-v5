type t =
  | Null
  | Bool of bool
  | Int of int
  | Float of float
  | String of string
  | Array of t list
  | Object of (string * t) list
  | Map of (t * t) list

val to_string : t -> string
val string : string -> string
