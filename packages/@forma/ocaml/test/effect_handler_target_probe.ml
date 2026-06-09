type _ Effect.t += Host_call : int Effect.t

let run () =
  Effect.Deep.match_with
    (fun () -> 1 + Effect.perform Host_call)
    ()
    {
      retc = (fun value -> value);
      exnc = raise;
      effc =
        (fun (type a) (eff : a Effect.t) ->
          match eff with
          | Host_call ->
              Some
                (fun (continuation : (a, int) Effect.Deep.continuation) ->
                  Effect.Deep.continue continuation 41)
          | _ -> None);
    }

let () = Printf.printf "{\"ok\":true,\"value\":%d}\n" (run ())
