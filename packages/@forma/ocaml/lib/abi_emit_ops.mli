type request = Abi_request.t

val emitted_values_many :
  with_session:(string option -> (Session.t -> string) -> string) ->
  request ->
  string

val emit_backends_json : unit -> string

val emit_source :
  with_session:(string option -> (Session.t -> string) -> string) ->
  engine_name:string ->
  engine_version:string ->
  request ->
  string

val emit_many :
  with_session:(string option -> (Session.t -> string) -> string) ->
  engine_name:string ->
  engine_version:string ->
  request ->
  string

val artifact_summary :
  with_session:(string option -> (Session.t -> string) -> string) ->
  request ->
  string
