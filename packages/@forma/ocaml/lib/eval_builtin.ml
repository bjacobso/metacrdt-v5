type value = Value.t =
  | VNil
  | VBool of bool
  | VInt of int
  | VFloat of float
  | VString of string
  | VSymbol of string
  | VKeyword of string
  | VList of value list
  | VVector of value list
  | VMap of (value * value) list
  | VClosure of closure
  | VMacro of closure

and closure = Value.closure = {
  params : string list;
  rest_param : string option;
  body : Ast.expr list;
  env : (string * value) list;
}

type diagnostic = Eval_common.diagnostic = {
  span : Ast.span option;
  code : string;
  message : string;
}

type context = {
  eval_expr : Env.t -> Reader.expr -> (value, diagnostic list) result;
  eval_all : Env.t -> Reader.expr list -> (value list, diagnostic list) result;
  apply_closure_values :
    Value.closure -> value list -> (value, diagnostic list) result;
}

let diagnostic = Eval_common.diagnostic

module Collection = Eval_builtin_collection

let eval ctx env op args =
  let rec numeric_value env op expr =
    match ctx.eval_expr env expr with
    | Error _ as error -> error
    | Ok (VInt value) -> Ok (`Int value)
    | Ok (VFloat value) -> Ok (`Float value)
    | Ok _ ->
        Error
          [
            diagnostic "eval/expected-number"
              (Printf.sprintf "Builtin %s expects numeric arguments." op);
          ]
  and number_to_float = function
    | `Int value -> float_of_int value
    | `Float value -> value
  and all_int = List.for_all (function `Int _ -> true | `Float _ -> false)
  and numeric_fold env op initial f args =
    let rec loop acc values = function
      | [] ->
          if all_int values then Ok (VInt (int_of_float acc))
          else Ok (VFloat acc)
      | expr :: rest -> (
          match numeric_value env op expr with
          | Error _ as error -> error
          | Ok value ->
              loop (f acc (number_to_float value)) (value :: values) rest)
    in
    loop initial [] args
  and numeric_minus env = function
    | [] ->
        Error
          [
            diagnostic "eval/arity"
              "Builtin - expects at least one numeric argument.";
          ]
    | first :: rest -> (
        match numeric_value env "-" first with
        | Error _ as error -> error
        | Ok first_value ->
            let initial = number_to_float first_value in
            let rec loop acc values = function
              | [] ->
                  if all_int values then Ok (VInt (int_of_float acc))
                  else Ok (VFloat acc)
              | expr :: remaining -> (
                  match numeric_value env "-" expr with
                  | Error _ as error -> error
                  | Ok value ->
                      loop
                        (acc -. number_to_float value)
                        (value :: values) remaining)
            in
            if rest = [] then
              let negated = -.initial in
              if all_int [ first_value ] then Ok (VInt (int_of_float negated))
              else Ok (VFloat negated)
            else loop initial [ first_value ] rest)
  and numeric_divide env = function
    | [] ->
        Error
          [
            diagnostic "eval/arity"
              "Builtin / expects at least one numeric argument.";
          ]
    | first :: rest -> (
        match numeric_value env "/" first with
        | Error _ as error -> error
        | Ok first_value ->
            let initial = number_to_float first_value in
            let rec loop acc = function
              | [] -> Ok (VFloat acc)
              | expr :: remaining -> (
                  match numeric_value env "/" expr with
                  | Error _ as error -> error
                  | Ok value -> loop (acc /. number_to_float value) remaining)
            in
            if rest = [] then Ok (VFloat (1.0 /. initial))
            else loop initial rest)
  and int_binary env op f = function
    | [ left; right ] -> (
        match (ctx.eval_expr env left, ctx.eval_expr env right) with
        | Ok (VInt left), Ok (VInt right) -> Ok (VInt (f left right))
        | Error diagnostics, _ | _, Error diagnostics -> Error diagnostics
        | _ ->
            Error
              [
                diagnostic "eval/expected-int"
                  (Printf.sprintf "Builtin %s expects integer arguments." op);
              ])
    | _ ->
        Error
          [
            diagnostic "eval/arity"
              (Printf.sprintf "Builtin %s expects exactly two arguments." op);
          ]
  and compare_numeric env op compare args =
    match args with
    | [ left; right ] -> (
        match (numeric_value env op left, numeric_value env op right) with
        | Ok left, Ok right ->
            Ok (VBool (compare (number_to_float left) (number_to_float right)))
        | Error diagnostics, _ | _, Error diagnostics -> Error diagnostics)
    | _ ->
        Error
          [
            diagnostic "eval/arity"
              (Printf.sprintf "Builtin %s expects exactly two arguments." op);
          ]
  and eval_equals env = function
    | [ left; right ] -> (
        match (ctx.eval_expr env left, ctx.eval_expr env right) with
        | Ok left, Ok right -> Ok (VBool (Value.equal left right))
        | Error diagnostics, _ | _, Error diagnostics -> Error diagnostics)
    | _ -> Error [ diagnostic "eval/arity" "= expects exactly two arguments." ]
  and eval_not_equals env = function
    | [ left; right ] -> (
        match (ctx.eval_expr env left, ctx.eval_expr env right) with
        | Ok left, Ok right -> Ok (VBool (not (Value.equal left right)))
        | Error diagnostics, _ | _, Error diagnostics -> Error diagnostics)
    | _ -> Error [ diagnostic "eval/arity" "!= expects exactly two arguments." ]
  and eval_format env = function
    | template :: values -> (
        match ctx.eval_expr env template with
        | Error _ as error -> error
        | Ok (VString template) -> (
            match ctx.eval_all env values with
            | Error _ as error -> error
            | Ok values ->
                let replacements = List.map Value.to_format_part values in
                let buffer = Buffer.create (String.length template + 32) in
                let rec loop index replacements =
                  if index >= String.length template then ()
                  else if
                    index + 1 < String.length template
                    && template.[index] = '{'
                    && template.[index + 1] = '}'
                  then (
                    match replacements with
                    | replacement :: rest ->
                        Buffer.add_string buffer replacement;
                        loop (index + 2) rest
                    | [] ->
                        Buffer.add_string buffer "{}";
                        loop (index + 2) [])
                  else (
                    Buffer.add_char buffer template.[index];
                    loop (index + 1) replacements)
                in
                loop 0 replacements;
                Ok (VString (Buffer.contents buffer)))
        | Ok _ ->
            Error
              [
                diagnostic "eval/expected-string"
                  "format expects a string template.";
              ])
    | [] ->
        Error
          [
            diagnostic "eval/arity"
              "format expects a string template followed by values.";
          ]
  and eval_predicate env name args predicate =
    match args with
    | [ expr ] -> (
        match ctx.eval_expr env expr with
        | Ok value -> Ok (VBool (predicate value))
        | Error _ as error -> error)
    | _ ->
        Error
          [
            diagnostic "eval/arity"
              (Printf.sprintf "%s expects one argument." name);
          ]
  in
  let some result = Result.map (fun value -> Some value) result in
  match op with
  | "module" -> some (Ok VNil)
  | "+" -> some (numeric_fold env op 0.0 ( +. ) args)
  | "*" -> some (numeric_fold env op 1.0 ( *. ) args)
  | "-" -> some (numeric_minus env args)
  | "/" -> some (numeric_divide env args)
  | "mod" -> some (int_binary env op ( mod ) args)
  | "=" -> some (eval_equals env args)
  | "!=" -> some (eval_not_equals env args)
  | "<" -> some (compare_numeric env op ( < ) args)
  | "<=" -> some (compare_numeric env op ( <= ) args)
  | ">" -> some (compare_numeric env op ( > ) args)
  | ">=" -> some (compare_numeric env op ( >= ) args)
  | "list" ->
      some (ctx.eval_all env args |> Result.map (fun values -> VList values))
  | "str" -> some (ctx.eval_all env args |> Result.map Value.concat_string)
  | "format" -> some (eval_format env args)
  | "nil?" ->
      some
        (eval_predicate env "nil?" args (function VNil -> true | _ -> false))
  | "string?" ->
      some
        (eval_predicate env "string?" args (function
          | VString _ -> true
          | _ -> false))
  | "number?" ->
      some
        (eval_predicate env "number?" args (function
          | VInt _ | VFloat _ -> true
          | _ -> false))
  | "boolean?" ->
      some
        (eval_predicate env "boolean?" args (function
          | VBool _ -> true
          | _ -> false))
  | "list?" ->
      some
        (eval_predicate env "list?" args (function
          | VList _ | VVector _ -> true
          | _ -> false))
  | "map?" ->
      some
        (eval_predicate env "map?" args (function VMap _ -> true | _ -> false))
  | "fn?" ->
      some
        (eval_predicate env "fn?" args (function
          | VClosure _ -> true
          | _ -> false))
  | _ ->
      Collection.eval
        Collection.
          {
            eval_expr = ctx.eval_expr;
            eval_all = ctx.eval_all;
            apply_closure_values = ctx.apply_closure_values;
          }
        env op args
