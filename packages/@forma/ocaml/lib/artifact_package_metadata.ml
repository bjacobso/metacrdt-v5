type ir_version = Ir_version of string
type kind = Kind of string
type hash_algorithm = Hash_algorithm of string
type source_hash = Source_hash of string
type declarations_hash = Declarations_hash of string

let current_ir_version = Ir_version "1"
let canonical_ir_kind = Kind "CanonicalIr"
let md5_hash_algorithm = Hash_algorithm "md5"
let source_hash value = Source_hash value
let ir_version_to_string (Ir_version value) = value
let kind_to_string (Kind value) = value
let hash_algorithm_to_string (Hash_algorithm value) = value
let source_hash_to_string (Source_hash value) = value
let declarations_hash_to_string (Declarations_hash value) = value

let hash_declarations algorithm value =
  match hash_algorithm_to_string algorithm with
  | "md5" -> Declarations_hash (Digest.to_hex (Digest.string value))
  | name ->
      invalid_arg
        (Printf.sprintf "Unsupported artifact package hash algorithm %S." name)
