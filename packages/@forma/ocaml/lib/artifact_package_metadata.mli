type ir_version
type kind
type hash_algorithm
type source_hash
type declarations_hash

val current_ir_version : ir_version
val canonical_ir_kind : kind
val md5_hash_algorithm : hash_algorithm
val source_hash : string -> source_hash
val hash_declarations : hash_algorithm -> string -> declarations_hash
val ir_version_to_string : ir_version -> string
val kind_to_string : kind -> string
val hash_algorithm_to_string : hash_algorithm -> string
val source_hash_to_string : source_hash -> string
val declarations_hash_to_string : declarations_hash -> string
