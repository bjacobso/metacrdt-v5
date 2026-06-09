type request = Abi_request.t

val parse_source : request -> string
val parse_ast_source : request -> string
val parse_summary : request -> string

val expand_source :
  with_session:(string option -> (Session.t -> string) -> string) ->
  request ->
  string

val lower_core_source :
  with_session:(string option -> (Session.t -> string) -> string) ->
  request ->
  string

val typecheck_core_source :
  ?typed:bool ->
  with_session:(string option -> (Session.t -> string) -> string) ->
  request ->
  string

val evaluate_source :
  with_session:(string option -> (Session.t -> string) -> string) ->
  request ->
  string

val typecheck_source :
  with_session:(string option -> (Session.t -> string) -> string) ->
  request ->
  string

val emitted_values_source :
  with_session:(string option -> (Session.t -> string) -> string) ->
  request ->
  string
