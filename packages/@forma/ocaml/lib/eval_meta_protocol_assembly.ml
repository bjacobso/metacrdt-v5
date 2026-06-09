type diagnostic = Eval_common.diagnostic = {
  span : Ast.span option;
  code : string;
  message : string;
}

type protocol_registry = Eval_meta_protocol_metadata.protocol_registry

type component_registry_fields =
  Eval_meta_protocol_metadata.component_registry_fields

type slot_registry_fields = Eval_meta_protocol_metadata.slot_registry_fields
type action_registry_fields = Eval_meta_protocol_metadata.action_registry_fields
type expr_registry_fields = Eval_meta_protocol_metadata.expr_registry_fields

type layout_alias_registry_fields =
  Eval_meta_protocol_metadata.layout_alias_registry_fields

type runtime_invocation =
  | Layout_only of string
  | Component_layout
  | Hosted_dsl_component_layout of string

type protocol_runtime_shape = {
  op_name : string;
  invocations : runtime_invocation list;
}

type protocol_registry_env = {
  registry : protocol_registry;
  header : Eval_meta_protocol_metadata.protocol_registry_header;
  component_fields : component_registry_fields;
  slot_fields : slot_registry_fields;
  action_fields : action_registry_fields;
  expr_fields : expr_registry_fields;
  layout_alias_fields : layout_alias_registry_fields;
}

type protocol_runtime_contract = {
  registry_env : protocol_registry_env;
  shape : protocol_runtime_shape;
}

type protocol_forms_env = {
  registry_env : protocol_registry_env;
  forms : Descriptor.form list;
}

type protocol_component_env = {
  forms_env : protocol_forms_env;
  component_registry : Eval_meta_protocol_component_model.component_registry;
}

type component_registry =
      Eval_meta_protocol_component_model.component_registry = {
  protocol : Eval_meta_protocol_component_model.component_protocol;
  specs : (string * Eval_meta_protocol_component_model.component_spec) list;
}

type protocol_context = {
  layout_aliases : Eval_meta_protocol_lowering.layout_alias_context;
  tree_context : Eval_meta_protocol_component_tree.tree_compile_context;
}

let diagnostic = Eval_common.diagnostic

let registry_env_of_registry (registry : protocol_registry) =
  {
    registry;
    header = registry.header;
    component_fields = registry.component_fields;
    slot_fields = registry.slot_fields;
    action_fields = registry.action_fields;
    expr_fields = registry.expr_fields;
    layout_alias_fields = registry.layout_alias_fields;
  }

let component_protocol_of_forms_env (forms_env : protocol_forms_env) =
  Eval_meta_protocol_metadata_extract.build_component_protocol_from_forms
    forms_env.forms forms_env.registry_env.component_fields
    forms_env.registry_env.slot_fields

let runtime_shape_of_registry_env (registry_env : protocol_registry_env) =
  {
    op_name = registry_env.header.compile_layout_tree_op;
    invocations =
      List.filter_map Fun.id
        [
          (if registry_env.header.allow_default_component_layout_args then
             Some
               (Layout_only registry_env.component_fields.component_extension)
           else None);
          Some Component_layout;
          (if registry_env.header.allow_hosted_dsl_name_layout_args then
             Some
               (Hosted_dsl_component_layout registry_env.header.hosted_dsl_name)
           else None);
        ];
  }

let runtime_contract_of_registry_env (registry_env : protocol_registry_env) =
  { registry_env; shape = runtime_shape_of_registry_env registry_env }

let assemble_runtime_contract_for_op env op =
  Eval_meta_protocol_metadata.build_protocol_registry_for_op env op
  |> Option.map registry_env_of_registry
  |> Option.map runtime_contract_of_registry_env

let build_component_compile_contract
    (component_fields : component_registry_fields)
    (slot_fields : slot_registry_fields)
    (component_protocol : Eval_meta_protocol_component_model.component_protocol)
    =
  {
    Eval_meta_protocol_component_spec.extension_key =
      component_fields.component_extension;
    prop_name_normalization = component_protocol.prop_name_normalization;
    field_names =
      {
        Eval_meta_protocol_component_spec.compile_field =
          component_fields.component_compile_field;
        children_policy_field = component_fields.component_children_policy_field;
        parents_field = component_fields.component_parents_field;
        allows_bind_field = component_fields.component_allows_bind_field;
        json_slots_field = component_fields.component_json_slots_field;
        node_slots_field = component_fields.component_node_slots_field;
        expr_props_field = component_fields.component_expr_props_field;
        unknown_props_field = component_fields.component_unknown_props_field;
        required_children_field =
          component_fields.component_required_children_field;
        required_bind_field = component_fields.component_required_bind_field;
        field_overrides_field = component_fields.component_field_overrides_field;
        event_overrides_field = component_fields.component_event_overrides_field;
        positional_prop_field = component_fields.component_positional_prop_field;
        events_field = component_fields.component_events_field;
        type_field_field = component_fields.component_type_field_field;
        events_section_field = component_fields.component_events_section_field;
        props_section_field = component_fields.component_props_section_field;
        children_section_field =
          component_fields.component_children_section_field;
      };
    slot_defaults =
      {
        Eval_meta_protocol_component_spec.default_form_slot_kind =
          slot_fields.default_form_slot_kind;
        default_value_slot_kind = slot_fields.default_value_slot_kind;
        default_expr_slot_kind = slot_fields.default_expr_slot_kind;
      };
  }

let assemble_component_registry forms
    (component_fields : component_registry_fields)
    (slot_fields : slot_registry_fields) component_protocol : component_registry
    =
  let contract =
    build_component_compile_contract component_fields slot_fields
      component_protocol
  in
  let specs =
    Eval_meta_protocol_component_spec.build_component_specs_from_forms forms
      contract
  in
  { protocol = component_protocol; specs }

let component_env_of_forms_env component_extension
    (forms_env : protocol_forms_env) =
  if
    forms_env.registry_env.component_fields.component_extension
    <> component_extension
  then
    Error
      [
        diagnostic "eval/protocol-registry"
          (Printf.sprintf
             "%s does not declare protocol/registry metadata for %s."
             forms_env.registry_env.header.compile_layout_tree_op
             component_extension);
      ]
  else
    match component_protocol_of_forms_env forms_env with
    | Some component_protocol ->
        let component_registry =
          assemble_component_registry forms_env.forms
            forms_env.registry_env.component_fields
            forms_env.registry_env.slot_fields component_protocol
        in
        Ok { forms_env; component_registry }
    | None ->
        Error
          [
            diagnostic "eval/component-protocol"
              (Printf.sprintf "%s requires %s metadata in the environment."
                 forms_env.registry_env.header.compile_layout_tree_op
                 forms_env.registry_env.component_fields
                   .component_protocol_extension);
          ]

let assemble_layout_bundle forms
    (layout_alias_fields : layout_alias_registry_fields) :
    Eval_meta_protocol_lowering.layout_alias_context =
  {
    component_name_prop_field =
      layout_alias_fields.layout_alias_component_name_prop_field;
    aliases =
      Eval_meta_protocol_metadata_extract.build_layout_aliases_from_forms forms
        layout_alias_fields;
  }

let assemble_expr_bundle forms (expr_fields : expr_registry_fields) :
    Eval_meta_protocol_lowering.expr_compile_context =
  {
    source_config =
      Eval_meta_protocol_metadata_extract.build_expr_source_config_from_forms
        forms expr_fields;
    mechanism_config = expr_fields.expr_mechanism_config;
    shape_config = expr_fields.expr_shape_config;
    op_config =
      Eval_meta_protocol_metadata_extract.build_expr_op_config_from_forms forms
        expr_fields;
  }

let assemble_lowering_context forms (action_fields : action_registry_fields)
    (expr_fields : expr_registry_fields) :
    Eval_meta_protocol_lowering.lowering_context =
  let action_specs =
    Eval_meta_protocol_metadata_extract.build_action_specs_from_forms forms
      action_fields
  in
  let expr = assemble_expr_bundle forms expr_fields in
  { Eval_meta_protocol_lowering.expr; action_specs }

let assemble_tree_context (component_env : protocol_component_env) =
  let forms_env = component_env.forms_env in
  let registry_env = forms_env.registry_env in
  let lowering =
    assemble_lowering_context forms_env.forms registry_env.action_fields
      registry_env.expr_fields
  in
  {
    Eval_meta_protocol_component_tree.registry =
      component_env.component_registry;
    node_ops =
      Eval_meta_protocol_lowering.node_compile_ops_factory_with_context lowering;
  }

let protocol_context_of_component_env (component_env : protocol_component_env) =
  let forms_env = component_env.forms_env in
  let layout_aliases =
    assemble_layout_bundle forms_env.forms
      forms_env.registry_env.layout_alias_fields
  in
  { layout_aliases; tree_context = assemble_tree_context component_env }

let assemble_protocol_context_with_registry_env env
    (registry_env : protocol_registry_env) component_extension =
  let forms_env = { registry_env; forms = Descriptor.forms env } in
  match component_env_of_forms_env component_extension forms_env with
  | Error diagnostics -> Error diagnostics
  | Ok component_env -> Ok (protocol_context_of_component_env component_env)

let assemble_protocol_context_with_registry env (registry : protocol_registry)
    component_extension =
  assemble_protocol_context_with_registry_env env
    (registry_env_of_registry registry)
    component_extension
