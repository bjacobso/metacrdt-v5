let request =
  if Array.length Sys.argv > 1 then Sys.argv.(1) else "{\"op\":\"version\"}"

let () = print_endline (Language_ocaml.Abi.handle_json request)
