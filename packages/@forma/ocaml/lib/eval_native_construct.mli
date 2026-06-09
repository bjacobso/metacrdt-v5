val apply :
  ?fallback_available:bool -> Env.t -> string -> Value.t -> Value.t option

val has_descriptor : Env.t -> string -> bool
