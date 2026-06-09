val type_expr_of_meta_type_value : Value.t -> Type_expr.ty option

val required_declaration_summary_of_emitted_value :
  Value.t -> (Artifact_summary_types.declaration_summary, string) result

val descriptor_hooks : Env.t -> Descriptor_protocol.descriptor_hooks
