type request = Abi_request.t

type repl_submit_result = {
  id : string;
  form_count : int;
  value : Eval.value;
  typ : string;
}

type repl_submit_error =
  | Repl_reader of Reader.diagnostic list
  | Repl_eval of Eval.diagnostic list
  | Repl_typecheck of Type_diagnostic.t list

val with_session : string option -> (Session.t -> string) -> string
val open_session : unit -> string
val close_session : string option -> string
val reset_session : string option -> string
val load_prelude : request -> string
val load_source : request -> string
val load_source_bundle : request -> string

val submit_repl :
  Session.t ->
  source_id:string option ->
  source:string ->
  (repl_submit_result, repl_submit_error) result

val repl_submit : request -> string
val resume_host_call : request -> string
val abort_evaluation : request -> string
val call_value : request -> string
val release_value : request -> string
val session_summary : Session.t -> string
val source_summary : Session.t -> string
