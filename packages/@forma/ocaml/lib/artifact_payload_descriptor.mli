type field_kind = String | Array | Object
type field_constraint

val field_constraint_field : field_constraint -> string
val field_constraint_kind : field_constraint -> field_kind option
val field_constraint_literal : field_constraint -> string option

type contract

val empty : contract
val contract_required_fields : contract -> string list
val contract_field_constraints : contract -> field_constraint list
val contract_by_name : Env.t -> string -> (contract, string) result
val contract_of_form : Env.t -> Descriptor.form -> (contract, string) result
val contract : Env.t -> string -> (contract, string) result
