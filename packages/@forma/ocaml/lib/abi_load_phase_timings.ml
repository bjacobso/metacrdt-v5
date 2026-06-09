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

let zero =
  {
    parse_ms = 0.;
    eval_ms = 0.;
    typecheck_ms = 0.;
    metacheck_ms = 0.;
    store_ms = 0.;
    elaborate_ms = 0.;
    elaborate_expand_ms = 0.;
    elaborate_collect_ms = 0.;
    elaborate_apply_hook_ms = 0.;
    elaborate_hook_timings = [];
    elaborate_hook_counts = [];
    elaborate_summary_expectation_ms = 0.;
    elaborate_payload_contract_ms = 0.;
    elaborate_summary_validation_ms = 0.;
    typed_decl_ms = 0.;
    validate_ms = 0.;
    artifact_cache_ms = 0.;
  }

let merge_named_timings left right =
  let add timings (name, ms) =
    let rec loop acc = function
      | [] -> List.rev ((name, ms) :: acc)
      | (existing, total) :: rest when existing = name ->
          List.rev_append acc ((existing, total +. ms) :: rest)
      | entry :: rest -> loop (entry :: acc) rest
    in
    loop [] timings
  in
  List.fold_left add left right |> List.sort compare

let merge_named_counts left right =
  let add counts (name, count) =
    let rec loop acc = function
      | [] -> List.rev ((name, count) :: acc)
      | (existing, total) :: rest when existing = name ->
          List.rev_append acc ((existing, total + count) :: rest)
      | entry :: rest -> loop (entry :: acc) rest
    in
    loop [] counts
  in
  List.fold_left add left right |> List.sort compare

let add left right =
  {
    parse_ms = left.parse_ms +. right.parse_ms;
    eval_ms = left.eval_ms +. right.eval_ms;
    typecheck_ms = left.typecheck_ms +. right.typecheck_ms;
    metacheck_ms = left.metacheck_ms +. right.metacheck_ms;
    store_ms = left.store_ms +. right.store_ms;
    elaborate_ms = left.elaborate_ms +. right.elaborate_ms;
    elaborate_expand_ms = left.elaborate_expand_ms +. right.elaborate_expand_ms;
    elaborate_collect_ms =
      left.elaborate_collect_ms +. right.elaborate_collect_ms;
    elaborate_apply_hook_ms =
      left.elaborate_apply_hook_ms +. right.elaborate_apply_hook_ms;
    elaborate_hook_timings =
      merge_named_timings left.elaborate_hook_timings
        right.elaborate_hook_timings;
    elaborate_hook_counts =
      merge_named_counts left.elaborate_hook_counts right.elaborate_hook_counts;
    elaborate_summary_expectation_ms =
      left.elaborate_summary_expectation_ms
      +. right.elaborate_summary_expectation_ms;
    elaborate_payload_contract_ms =
      left.elaborate_payload_contract_ms +. right.elaborate_payload_contract_ms;
    elaborate_summary_validation_ms =
      left.elaborate_summary_validation_ms
      +. right.elaborate_summary_validation_ms;
    typed_decl_ms = left.typed_decl_ms +. right.typed_decl_ms;
    validate_ms = left.validate_ms +. right.validate_ms;
    artifact_cache_ms = left.artifact_cache_ms +. right.artifact_cache_ms;
  }

let timed_ms f =
  let started = Sys.time () in
  let result = f () in
  (result, (Sys.time () -. started) *. 1000.)

let named_timings_json timings =
  timings
  |> List.map (fun (name, ms) ->
      Printf.sprintf "%s:%.2f" (Value.string_json name) ms)
  |> String.concat "," |> Printf.sprintf "{%s}"

let named_counts_json counts =
  counts
  |> List.map (fun (name, count) ->
      Printf.sprintf "%s:%d" (Value.string_json name) count)
  |> String.concat "," |> Printf.sprintf "{%s}"

let to_json timings =
  Printf.sprintf
    "{\"parseMs\":%.2f,\"evalMs\":%.2f,\"typecheckMs\":%.2f,\"metacheckMs\":%.2f,\"storeMs\":%.2f,\"elaborateMs\":%.2f,\"elaborateExpandMs\":%.2f,\"elaborateCollectMs\":%.2f,\"elaborateApplyHookMs\":%.2f,\"elaborateHookTimings\":%s,\"elaborateHookCounts\":%s,\"elaborateSummaryExpectationMs\":%.2f,\"elaboratePayloadContractMs\":%.2f,\"elaborateSummaryValidationMs\":%.2f,\"typedDeclMs\":%.2f,\"validateMs\":%.2f,\"artifactCacheMs\":%.2f}"
    timings.parse_ms timings.eval_ms timings.typecheck_ms timings.metacheck_ms
    timings.store_ms timings.elaborate_ms timings.elaborate_expand_ms
    timings.elaborate_collect_ms timings.elaborate_apply_hook_ms
    (named_timings_json timings.elaborate_hook_timings)
    (named_counts_json timings.elaborate_hook_counts)
    timings.elaborate_summary_expectation_ms
    timings.elaborate_payload_contract_ms
    timings.elaborate_summary_validation_ms timings.typed_decl_ms
    timings.validate_ms timings.artifact_cache_ms

let with_elaborate timings elaborate_timings =
  let hook_metrics =
    add timings
      {
        zero with
        elaborate_hook_timings = elaborate_timings.Elaborate.hook_timings;
        elaborate_hook_counts = elaborate_timings.hook_counts;
      }
  in
  {
    timings with
    elaborate_expand_ms =
      timings.elaborate_expand_ms +. elaborate_timings.Elaborate.expand_ms;
    elaborate_collect_ms =
      timings.elaborate_collect_ms +. elaborate_timings.collect_ms;
    elaborate_apply_hook_ms =
      timings.elaborate_apply_hook_ms +. elaborate_timings.apply_hook_ms;
    elaborate_hook_timings = hook_metrics.elaborate_hook_timings;
    elaborate_hook_counts = hook_metrics.elaborate_hook_counts;
    elaborate_summary_expectation_ms =
      timings.elaborate_summary_expectation_ms
      +. elaborate_timings.summary_expectation_ms;
    elaborate_payload_contract_ms =
      timings.elaborate_payload_contract_ms
      +. elaborate_timings.payload_contract_ms;
    elaborate_summary_validation_ms =
      timings.elaborate_summary_validation_ms
      +. elaborate_timings.summary_validation_ms;
  }
