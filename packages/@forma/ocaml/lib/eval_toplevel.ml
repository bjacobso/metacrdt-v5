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
  parse_params :
    Reader.expr list -> (string list * string option, diagnostic list) result;
}

let diagnostic = Eval_common.diagnostic

let descriptor_diagnostics (diagnostics : Descriptor.diagnostic list) :
    diagnostic list =
  List.map
    (fun (descriptor_diagnostic : Descriptor.diagnostic) ->
      diagnostic ?span:descriptor_diagnostic.span descriptor_diagnostic.code
        descriptor_diagnostic.message)
    diagnostics

let eval ctx env = function
  | Reader.List
      (_, Reader.Symbol (_, "define-form") :: Reader.Symbol (_, name) :: clauses)
    -> (
      match Descriptor.validate_form_clauses clauses with
      | Error diagnostics -> Error (descriptor_diagnostics diagnostics)
      | Ok () ->
          let value = Descriptor.declaration_value "form" name clauses in
          Ok (value, Env.bind name value env))
  | Reader.List (_, Reader.Symbol (_, "define-form") :: _) ->
      Error
        [
          diagnostic "eval/define-form"
            "define-form expects a symbol name followed by descriptor clauses.";
        ]
  | Reader.List
      (_, Reader.Symbol (_, "meta-fn") :: Reader.Symbol (_, name) :: clauses)
    -> (
      match Descriptor.validate_meta_fn_clauses clauses with
      | Error diagnostics -> Error (descriptor_diagnostics diagnostics)
      | Ok () ->
          let value =
            match Descriptor.meta_fn_body clauses with
            | Some body ->
                VClosure
                  {
                    params = [ "input" ];
                    rest_param = None;
                    body;
                    env = Env.bindings env;
                  }
            | None -> Descriptor.declaration_value "meta-fn" name clauses
          in
          Ok (value, Env.bind name value env))
  | Reader.List (_, Reader.Symbol (_, "meta-fn") :: _) ->
      Error
        [
          diagnostic "eval/meta-fn"
            "meta-fn expects a symbol name followed by descriptor clauses.";
        ]
  | Reader.List
      ( _,
        Reader.Symbol (_, "define-elaboration")
        :: Reader.Symbol (_, name)
        :: clauses ) ->
      let value = Descriptor.declaration_value "elaboration" name clauses in
      Ok (value, Env.bind name value env)
  | Reader.List
      ( _,
        Reader.Symbol (_, "define-elaboration-primitive")
        :: Reader.Symbol (_, name)
        :: clauses ) ->
      let value =
        Descriptor.declaration_value "elaboration-primitive" name clauses
      in
      Ok (value, Env.bind name value env)
  | Reader.List (_, Reader.Symbol (_, "define-elaboration") :: _) ->
      Error
        [
          diagnostic "eval/define-elaboration"
            "define-elaboration expects a symbol name followed by descriptor \
             clauses.";
        ]
  | Reader.List (_, Reader.Symbol (_, "define-elaboration-primitive") :: _) ->
      Error
        [
          diagnostic "eval/define-elaboration-primitive"
            "define-elaboration-primitive expects a symbol name followed by \
             descriptor clauses.";
        ]
  | Reader.List
      ( _,
        Reader.Symbol (_, "define-protocol")
        :: Reader.Symbol (_, name)
        :: clauses ) ->
      let value = Descriptor.declaration_value "protocol" name clauses in
      Ok (value, Env.bind name value env)
  | Reader.List (_, Reader.Symbol (_, "define-protocol") :: _) ->
      Error
        [
          diagnostic "eval/define-protocol"
            "define-protocol expects a symbol name followed by descriptor \
             clauses.";
        ]
  | Reader.List
      ( _,
        Reader.Symbol (_, "define-payload-contract")
        :: Reader.Symbol (_, name)
        :: clauses ) ->
      let value =
        Descriptor.declaration_value "payload-contract" name clauses
      in
      Ok (value, Env.bind name value env)
  | Reader.List (_, Reader.Symbol (_, "define-payload-contract") :: _) ->
      Error
        [
          diagnostic "eval/define-payload-contract"
            "define-payload-contract expects a symbol name followed by payload \
             descriptor clauses.";
        ]
  | Reader.List (_, Reader.Symbol (_, "define-effect") :: define_effect_args)
    -> (
      match Eval_effect.parse_define_effect define_effect_args with
      | Error _ as error -> error
      | Ok (name, operations) ->
          let value = Eval_effect_definition.value name operations in
          Ok (value, Env.bind name value env))
  | Reader.List
      ( _,
        Reader.Symbol (_, "defmacro")
        :: Reader.Symbol (_, name)
        :: Reader.Vector (_, params)
        :: body ) -> (
      match ctx.parse_params params with
      | Error _ as error -> error
      | Ok (params, rest_param) ->
          let value =
            VMacro { params; rest_param; body; env = Env.bindings env }
          in
          Ok (value, Env.bind name value env))
  | Reader.List (_, Reader.Symbol (_, "defmacro") :: _) ->
      Error
        [
          diagnostic "eval/defmacro-form"
            "defmacro expects a symbol name, parameter vector, and body forms.";
        ]
  | Reader.List
      ( _,
        Reader.Symbol (_, "define-macro")
        :: Reader.Symbol (_, name)
        :: Reader.Vector (_, params)
        :: body ) -> (
      match ctx.parse_params params with
      | Error _ as error -> error
      | Ok (params, rest_param) ->
          let value =
            VMacro { params; rest_param; body; env = Env.bindings env }
          in
          Ok (value, Env.bind name value env))
  | Reader.List (_, Reader.Symbol (_, "define-macro") :: _) ->
      Error
        [
          diagnostic "eval/define-macro-form"
            "define-macro expects a symbol name, parameter vector, and body \
             forms.";
        ]
  | Reader.List
      ( _,
        Reader.Symbol (_, "defn")
        :: Reader.Symbol (_, name)
        :: Reader.Vector (_, params)
        :: body ) -> (
      match ctx.parse_params params with
      | Error _ as error -> error
      | Ok (params, rest_param) ->
          let value =
            VClosure { params; rest_param; body; env = Env.bindings env }
          in
          Ok (value, Env.bind name value env))
  | Reader.List (_, Reader.Symbol (_, "defn") :: _) ->
      Error
        [
          diagnostic "eval/defn-form"
            "defn expects a symbol name, parameter vector, and body forms.";
        ]
  | Reader.List
      ( _,
        Reader.Symbol (_, "define")
        :: Reader.List (_, Reader.Symbol (_, name) :: params)
        :: body ) -> (
      match ctx.parse_params params with
      | Error _ as error -> error
      | Ok (params, rest_param) ->
          let value =
            VClosure { params; rest_param; body; env = Env.bindings env }
          in
          Ok (value, Env.bind name value env))
  | Reader.List
      (_, [ Reader.Symbol (_, "define"); Reader.Symbol (_, name); value_expr ])
    -> (
      match ctx.eval_expr env value_expr with
      | Error _ as error -> error
      | Ok value -> Ok (value, Env.bind name value env))
  | Reader.List (_, Reader.Symbol (_, "define") :: _) ->
      Error
        [
          diagnostic "eval/define-form"
            "define expects a symbol/value pair or function signature and body.";
        ]
  | Reader.List
      (_, [ Reader.Symbol (_, "def"); Reader.Symbol (_, name); value_expr ])
    -> (
      match ctx.eval_expr env value_expr with
      | Error _ as error -> error
      | Ok value -> Ok (value, Env.bind name value env))
  | Reader.List (_, Reader.Symbol (_, "def") :: _) ->
      Error
        [
          diagnostic "eval/def-form"
            "def expects a symbol name and a value expression.";
        ]
  | Reader.List
      ( _,
        [
          (Reader.Symbol (_, ":") | Reader.Keyword (_, ":")); Reader.Symbol _; _;
        ] ) ->
      Ok (VNil, env)
  | Reader.List
      (_, [ (Reader.Symbol (_, ":") | Reader.Keyword (_, ":")); value_expr; _ ])
    -> (
      match ctx.eval_expr env value_expr with
      | Error _ as error -> error
      | Ok value -> Ok (value, env))
  | Reader.List (_, Reader.Symbol (_, op) :: args)
    when Descriptor.is_form_descriptor env op ->
      let descriptor_form = Descriptor.form env op in
      let slot_validation =
        match descriptor_form with
        | Some form -> Descriptor.validate_application_slots form args
        | None -> Ok ()
      in
      (match slot_validation with
      | Error diagnostics -> Error (descriptor_diagnostics diagnostics)
      | Ok () ->
          let value = Descriptor.application_value op args in
          let env =
            match Descriptor.declaration_binding_name args with
            | Some name -> Env.bind name value env
            | None -> env
          in
          Ok (value, env))
  | expr -> (
      match ctx.eval_expr env expr with
      | Error _ as error -> error
      | Ok value -> Ok (value, env))
