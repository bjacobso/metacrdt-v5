type severity = Error | Warning | Info
type note = { span : Cst.span option; message : string }
type fix = { span : Cst.span; replacement : string; message : string option }

type t = {
  span : Cst.span;
  severity : severity;
  code : string;
  message : string;
  path : string option;
  notes : note list;
  fixes : fix list;
}

val error :
  ?path:string -> span:Cst.span -> code:string -> message:string -> unit -> t

val to_ir_json : t -> Ir_json.t
val to_json : t -> string
