type t = {
  parse_ms : float;
  eval_ms : float;
  typecheck_ms : float;
  metacheck_ms : float;
  store_ms : float;
  elaborate_ms : float;
  elaborate_expand_ms : float;
  elaborate_collect_ms : float;
  elaborate_apply_hook_ms : float;
  elaborate_hook_timings : (string * float) list;
  elaborate_hook_counts : (string * int) list;
  elaborate_summary_expectation_ms : float;
  elaborate_payload_contract_ms : float;
  elaborate_summary_validation_ms : float;
  typed_decl_ms : float;
  validate_ms : float;
  artifact_cache_ms : float;
}

val zero : t
val add : t -> t -> t
val timed_ms : (unit -> 'a) -> 'a * float
val to_json : t -> string
val with_elaborate : t -> Elaborate.phase_timings -> t
