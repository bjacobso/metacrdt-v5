# Schemas And Types

Schemas should become a first-class language algebra in this package. They are
not just HTTP helper declarations, and they are not exactly the same thing as
HM types.

The intended split:

```text
Schema = runtime / transport validation contract
Type   = compile-time static shape
```

Schemas describe how values cross boundaries: HTTP requests, responses, JSON
payloads, forms, agent tools, connector sync, persistence envelopes, and host
runtime codecs. Types describe what programs can do at compile time.

The two overlap heavily, so every portable schema should have a type
projection that enters the typechecker.

## Example Syntax

Current HTTP API schema declarations already use this shape:

```lisp
(define-schema BlobHash
  (:kind string)
  (:pattern "^[a-f0-9]{64}$")
  (:brand "BlobHash")
  (:doc "64-char hex content hash"))

(define-schema BlobUploadResponse
  (:kind struct)
  (:fields
    (field hash BlobHash)
    (field size Int)
    (field mime-type String)
    (field filename (Optional String))
    (field is-new Bool))
  (:identifier "BlobUploadResponse")
  (:doc "Result of uploading a blob"))

(define-error DatabaseNotFound
  (:fields (field database String))
  (:status 404))
```

A more expression-oriented schema surface could eventually look like:

```lisp
(define-schema UserId
  (String :brand UserId :pattern "^[a-z0-9_]+$"))

(define-schema User
  (Struct
    [id UserId]
    [email (String :format email)]
    [age (Optional Int)]
    [role (Literal "admin" "member" "viewer")]))

(define-schema PaymentEvent
  (TaggedUnion :type
    [card-charged
      (Struct
        [type (Literal "card-charged")]
        [charge-id String]
        [amount Int])]
    [refund-issued
      (Struct
        [type (Literal "refund-issued")]
        [refund-id String]
        [amount Int])]))
```

The surface syntax can evolve. The key architectural requirement is that both
forms lower into one schema IR.

## Schema Algebra

The language layer may know a generic schema algebra:

```text
Schema =
  Primitive(String | Int | Float | Bool | Bytes | DateTime | Json)
  Literal(values)
  Struct(fields)
  Array(item)
  Map(key, value)
  Optional(schema)
  Nullable(schema)
  Union(variants)
  TaggedUnion(discriminator, variants)
  Ref(name)
  Brand(name, schema)
  Refinement(schema, predicate, message)
  Transform(input, output, logic)
  Annotated(schema, metadata)
```

This is language machinery. It is acceptable for OCaml to type this generic
algebra.

It is not acceptable for the engine to hard-code product vocabulary:

```text
PdfMapping
Employee
BlobUploadResponse
InvoiceDocument
```

Those are prelude/domain declarations validated against schemas or protocols.

## Type Projection

Schemas should project into HM types:

```text
String                          -> Str
Int                             -> Int
Bool                            -> Bool
(Optional String)               -> Option Str
(Array Employee)                -> List Employee
(String :brand UserId)          -> Brand UserId Str
(Struct [id String] [age Int])  -> {id: Str, age: Int}
(Ref Employee)                  -> Employee
```

Runtime-only schema metadata does not become HM type equality:

```text
pattern
format
min / max
examples
description
OpenAPI annotations
custom encoders
transforms
runtime-only refinements
```

Those stay in schema IR and are enforced by runtime validators or target
backends.

## Typechecker Integration

When a schema is declared:

```lisp
(define-schema User
  (Struct
    [id UserId]
    [email String]
    [age (Optional Int)]))
```

the compiler should bind both:

```text
User : Schema
User.Type : Type = {id: UserId, email: Str, age: Option Int}
```

Then ordinary logic can typecheck against schema-derived types:

```lisp
(fn [user : User]
  (get user :email))
```

This should infer:

```text
User -> Str
```

This should fail:

```lisp
(fn [user : User]
  (+ (get user :email) 1))
```

because `email` projects to `Str`, not `Int`.

## HTTP API Integration

HTTP APIs should use schemas for every boundary:

```lisp
(define-api-group blobs
  (:path-params
    (param database String)
    (param hash BlobHash))

  (endpoint upload
    (:method POST)
    (:path "/db/{database}/blobs")
    (:payload Bytes)
    (:query
      (field filename (Optional String)))
    (:success BlobUploadResponse)
    (:errors DatabaseNotFound InternalError)))
```

The compiler should derive:

```text
path params : {database: Str, hash: BlobHash}
payload     : Bytes
query       : {filename: Option Str}
success     : BlobUploadResponse
errors      : DatabaseNotFound | InternalError
```

Handler bodies should typecheck against those boundaries. Runtime translators
should use the same schema IR to decode requests and encode responses.

## Exporters

Schema IR should be reusable across targets:

```text
Schema IR -> JSON Schema
Schema IR -> OpenAPI components.schemas
Schema IR -> Effect Schema TypeScript source
Schema IR -> Zod source
Schema IR -> Rust serde validators
Schema IR -> UI form descriptors
Schema IR -> MCP / agent tool input schemas
```

JSON Schema and OpenAPI generation should be ordinary emit backends over
canonical IR:

```text
source -> schema IR -> json-schema backend
source -> HttpApi IR + schema IR -> openapi backend
```

They should not be direct source-string generators.

## Implementation Sequence

This should come after typed IR dominance starts. If declarations still flow
through runtime `Eval.value` maps, schema/type integration will harden the wrong
boundary.

Recommended order:

1. Move one declaration family onto typed IR builders.
2. Define the generic schema algebra in typed IR.
3. Convert `define-schema` and `define-error` to emit schema IR.
4. Implement schema-to-type projection.
5. Bind named schemas into the type environment.
6. Typecheck HTTP/action/handler bodies against schema-derived types.
7. Add JSON Schema and OpenAPI emit backends.

## Design Rule

OCaml may know generic schema machinery. It should not know domain-specific
schema instances. The source of truth for domain shapes remains Lisp
elaboration and protocol/schema declarations.
