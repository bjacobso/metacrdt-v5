type value = Value.t

type field = { name : string; schema : schema }

and schema =
  | Ref of string
  | Primitive of string
  | Literal of value
  | Optional of schema
  | Array of schema
  | Struct of field list
  | Union of schema list
  | Brand of { brand : string; schema : schema }
  | Annotated of { schema : schema; annotations : (string * value) list }

type endpoint = {
  name : string;
  method_ : string;
  path : string;
  payload : schema option;
  query : schema option;
  success : schema;
  errors : schema list;
}

type api_group = {
  name : string;
  path_params : field list;
  endpoints : endpoint list;
  handlers : value list;
  annotations : (string * value) list;
}

val schema_payload_of_value : value -> (string * string option * schema) option
val http_api_payload_of_value : value -> (string * api_group list) option
val field_value : field -> value
val schema_value : schema -> value
val endpoint_value : endpoint -> value
val api_group_value : api_group -> value

val schema_payload_value :
  name:string -> schema_kind:string option -> schema -> value

val http_api_payload_value : name:string -> groups:api_group list -> value
