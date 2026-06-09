type protocol_registry_header = {
  compile_layout_tree_op : string;
  hosted_dsl_name : string;
  allow_default_component_layout_args : bool;
  allow_hosted_dsl_name_layout_args : bool;
}

type component_registry_fields = {
  component_prop_name_normalization :
    Eval_meta_protocol_component_model.name_normalization;
  component_extension : string;
  component_protocol_extension : string;
  component_protocol_prop_name_normalization_field : string;
  component_protocol_type_field_field : string;
  component_protocol_props_field_field : string;
  component_protocol_events_field_field : string;
  component_protocol_children_field_field : string;
  component_protocol_bind_prop_field_field : string;
  component_protocol_required_bind_value_field_field : string;
  component_protocol_scalar_fallback_field_field : string;
  component_protocol_scalar_fallback_kind_field_field : string;
  component_protocol_unknown_props_field : string;
  component_compile_field : string;
  component_children_policy_field : string;
  component_parents_field : string;
  component_allows_bind_field : string;
  component_json_slots_field : string;
  component_node_slots_field : string;
  component_expr_props_field : string;
  component_unknown_props_field : string;
  component_required_children_field : string;
  component_required_bind_field : string;
  component_field_overrides_field : string;
  component_event_overrides_field : string;
  component_positional_prop_field : string;
  component_events_field : string;
  component_type_field_field : string;
  component_events_section_field : string;
  component_props_section_field : string;
  component_children_section_field : string;
}

type action_registry_fields = {
  action_form_field : string;
  action_discriminator_field_field : string;
  action_tag_field : string;
  action_callbacks_field : string;
  action_positional_field : string;
  action_keywords_field : string;
  action_extension : string;
  action_mechanism_config : Eval_meta_protocol_lowering.action_mechanism_config;
  action_field_kinds : (string * string) list;
}

type expr_registry_fields = {
  enum_extension : string;
  expr_op_form_field : string;
  expr_op_lowering_field : string;
  expr_op_name_field : string;
  expr_op_operator_field : string;
  expr_op_extension : string;
  expr_source_extension : string;
  expr_source_sigils_field : string;
  expr_source_enum : string;
  expr_mechanism_config : Eval_meta_protocol_lowering.expr_mechanism_config;
  expr_shape_config : Eval_meta_protocol_lowering.expr_shape_config;
  expr_op_lowerings : (string * string) list;
}

type layout_alias_registry_fields = {
  layout_alias_form_field : string;
  layout_alias_to_field : string;
  layout_alias_component_name_field : string;
  layout_alias_component_name_prop_field : string;
  layout_alias_extension : string;
  layout_alias_default_to : string;
}

type slot_registry_fields = {
  slot_compile_mechanism_config :
    Eval_meta_protocol_component_model.slot_compile_mechanism_config;
  slot_compile_kinds : (string * string) list;
  default_form_slot_kind : Eval_meta_protocol_component_model.slot_compile_kind;
  default_value_slot_kind :
    Eval_meta_protocol_component_model.slot_compile_kind;
  default_expr_slot_kind : Eval_meta_protocol_component_model.slot_compile_kind;
}

type protocol_registry = {
  header : protocol_registry_header;
  component_fields : component_registry_fields;
  action_fields : action_registry_fields;
  expr_fields : expr_registry_fields;
  layout_alias_fields : layout_alias_registry_fields;
  slot_fields : slot_registry_fields;
}
