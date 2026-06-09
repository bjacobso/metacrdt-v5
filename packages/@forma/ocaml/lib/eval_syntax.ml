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
}

let gensym_counter = ref 0
let diagnostic = Eval_common.diagnostic

let eval_gensym ctx env = function
  | [] ->
      incr gensym_counter;
      Ok (VSymbol (Printf.sprintf "g__%d" !gensym_counter))
  | [ prefix ] -> (
      match ctx.eval_expr env prefix with
      | Ok (VString prefix) ->
          incr gensym_counter;
          Ok (VSymbol (Printf.sprintf "%s__%d" prefix !gensym_counter))
      | Ok (VSymbol prefix) ->
          incr gensym_counter;
          Ok (VSymbol (Printf.sprintf "%s__%d" prefix !gensym_counter))
      | Ok _ ->
          incr gensym_counter;
          Ok (VSymbol (Printf.sprintf "g__%d" !gensym_counter))
      | Error _ as error -> error)
  | _ ->
      Error
        [
          diagnostic "eval/arity"
            "gensym expects zero arguments or one prefix argument.";
        ]

let eval_sexpr_sym_name ctx env = function
  | [ expr ] -> (
      match ctx.eval_expr env expr with
      | Ok (VSymbol name) | Ok (VKeyword name) | Ok (VString name) ->
          Ok (VString name)
      | Ok _ -> Ok VNil
      | Error _ as error -> error)
  | _ ->
      Error
        [ diagnostic "eval/arity" "sexpr-sym-name expects one syntax value." ]

let eval_sexpr_list ctx env = function
  | [ expr ] -> (
      match ctx.eval_expr env expr with
      | Ok (VList _) -> Ok (VBool true)
      | Ok _ -> Ok (VBool false)
      | Error _ as error -> error)
  | _ ->
      Error [ diagnostic "eval/arity" "sexpr-list? expects one syntax value." ]

let eval_sexpr_items ctx env = function
  | [ expr ] -> (
      match ctx.eval_expr env expr with
      | Ok (VList items) -> Ok (VList items)
      | Ok _ -> Ok (VList [])
      | Error _ as error -> error)
  | _ ->
      Error [ diagnostic "eval/arity" "sexpr-items expects one syntax value." ]

let eval ctx env op args =
  let some result = Result.map (fun value -> Some value) result in
  match op with
  | "gensym" -> some (eval_gensym ctx env args)
  | "sexpr-sym-name" -> some (eval_sexpr_sym_name ctx env args)
  | "sexpr-list?" -> some (eval_sexpr_list ctx env args)
  | "sexpr-items" -> some (eval_sexpr_items ctx env args)
  | _ -> Ok None
