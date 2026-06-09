type diagnostic = Descriptor_validation.diagnostic = {
  span : Ast.span option;
  code : string;
  message : string;
}

type slot = { name : string; aliases : string list }
type form = { name : string; slots : slot list }

val validate_slots : form -> Ast.expr list -> (unit, diagnostic list) result
