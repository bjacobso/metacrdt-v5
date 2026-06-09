import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { packageDir, readPreludes } from "./corpus.mjs";
import { requireNativeCli } from "./require-build.mjs";

const nativeCli = requireNativeCli();

const daemon = spawn(nativeCli, ["daemon"], {
  cwd: packageDir,
  stdio: ["pipe", "pipe", "pipe"],
});

let stderr = "";
daemon.stderr.on("data", (chunk) => {
  stderr += chunk;
});

const responses = [];
const waiters = [];
const lines = createInterface({ input: daemon.stdout });

lines.on("line", (line) => {
  responses.push(line);
  const waiter = waiters.shift();
  if (waiter) waiter();
});

const waitForLine = async () => {
  if (responses.length > 0) return responses.shift();
  return new Promise((resolveLine, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for daemon response. stderr: ${stderr}`));
    }, 10000);
    waiters.push(() => {
      clearTimeout(timeout);
      resolveLine(responses.shift());
    });
  });
};

const request = async (payload) => {
  daemon.stdin.write(`${JSON.stringify(payload)}\n`);
  const line = await waitForLine();
  try {
    return JSON.parse(line);
  } catch (error) {
    throw new Error(`Could not parse daemon response ${JSON.stringify(line)}: ${error}`);
  }
};

const expectOk = (label, response) => {
  if (response?.ok !== true) {
    throw new Error(`${label} failed:\n${JSON.stringify(response, null, 2)}`);
  }
};

const findDeclaration = (declarations, kind, name) => {
  const declaration = declarations.find(
    (candidate) => candidate?.kind === kind && candidate?.name === name,
  );
  if (!declaration) {
    throw new Error(`Missing ${kind} declaration ${name}`);
  }
  return declaration;
};

const findField = (fields, name) => {
  const field = fields.find((candidate) => candidate?.name === name);
  if (!field) {
    throw new Error(`Missing field ${name}`);
  }
  return field;
};

const validSourceId = "http-api/basic";
const validSource = `
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
    (field derived-from (Optional String))
    (field is-new Bool))
  (:identifier "BlobUploadResponse")
  (:doc "Result of uploading a blob to content-addressed storage"))

(define-error DatabaseNotFound
  (:fields (field database String))
  (:status 404))

(define-error BlobUploadError
  (:fields (field reason String))
  (:status 500))

(define-api-group blobs
  (:path-params
    (param database String)
    (param hash BlobHash))

  (endpoint upload
    (:method POST)
    (:path "/db/{database}/blobs")
    (:payload Uint8Array)
    (:query
      (field filename (Optional String))
      (field derived-from (Optional String)))
    (:success BlobUploadResponse)
    (:errors DatabaseNotFound BlobUploadError InternalError))

  (endpoint metadata
    (:method GET)
    (:path "/db/{database}/blobs/{hash}/metadata")
    (:success BlobUploadResponse)
    (:errors DatabaseNotFound InternalError)))
`;

const invalidSourceId = "http-api/invalid-path";
const invalidSource = `
(define-schema BlobUploadResponse
  (:kind struct)
  (:fields (field hash String)))

(define-api-group broken
  (:path-params
    (param database String))

  (endpoint metadata
    (:method GET)
    (:path "/db/{database}/blobs/{hash}/metadata")
    (:success BlobUploadResponse)
    (:errors InternalError)))
`;

const unknownSchemaSourceId = "http-api/unknown-schema";
const unknownSchemaSource = `
(define-api-group broken
  (:path-params)

  (endpoint list
    (:method GET)
    (:path "/broken")
    (:success MissingResponse)
    (:errors InternalError)))
`;

const undeclaredErrorSourceId = "http-api/undeclared-error";
const undeclaredErrorSource = `
(define-schema BlobUploadResponse
  (:kind struct)
  (:fields (field hash String)))

(define-schema PlainProblem
  (:kind struct)
  (:fields (field reason String)))

(define-api-group broken
  (:path-params)

  (endpoint list
    (:method GET)
    (:path "/broken")
    (:success BlobUploadResponse)
    (:errors PlainProblem)))
`;

let sessionId;
let hardFailure;

try {
  const opened = await request({ op: "openSession" });
  expectOk("openSession", opened);
  sessionId = opened.value.sessionId;

  for (const prelude of readPreludes()) {
    const response = await request({
      op: "loadPrelude",
      sessionId,
      ...prelude,
    });
    expectOk(`loadPrelude ${prelude.sourceId}`, response);
  }

  expectOk(
    `loadSource ${validSourceId}`,
    await request({ op: "loadSource", sessionId, sourceId: validSourceId, source: validSource }),
  );

  const emitted = await request({
    op: "emit",
    sessionId,
    backend: "canonical-ir",
    sourceId: validSourceId,
  });
  expectOk("emit valid HTTP API", emitted);

  const content = emitted.value?.artifacts?.[0]?.content;
  if (
    content?.kind !== "CanonicalIr" ||
    content?.declarationCount !== 5 ||
    !Array.isArray(content?.declarations) ||
    content.declarations.some((declaration) =>
      Object.prototype.hasOwnProperty.call(declaration, "$summary"),
    ) ||
    content?.typeSummary?.declarationCount !== 5 ||
    content?.typeSummary?.resultTypes?.SchemaDecl !== 4 ||
    content?.typeSummary?.resultTypes?.HttpApiDecl !== 1 ||
    !Array.isArray(content?.declarationTypeSummaries) ||
    content.declarationTypeSummaries.some(
      (summary) => summary == null || summary.resultType == null,
    ) ||
    content.declarationTypeSummaries[4]?.kind !== "HttpApi" ||
    content.declarationTypeSummaries[4]?.name !== "blobs" ||
    content.declarationTypeSummaries[4]?.resultType !== "HttpApiDecl" ||
    !Array.isArray(content?.derivedArtifacts) ||
    content.derivedArtifacts[0]?.declarations?.some(
      (declaration) => declaration?.kind === "Unknown" || declaration?.resultType == null,
    ) ||
    content.derivedArtifacts[0]?.declarations?.[4]?.resultType !== "HttpApiDecl"
  ) {
    throw new Error(`Unexpected HTTP API IR envelope:\n${JSON.stringify(emitted, null, 2)}`);
  }

  const blobHash = findDeclaration(content.declarations, "Schema", "BlobHash");
  if (
    blobHash.schema?.kind !== "Annotated" ||
    blobHash.schema.schema?.kind !== "Brand" ||
    blobHash.schema.schema?.schema?.prim !== "String" ||
    blobHash.schema.annotations?.pattern !== "^[a-f0-9]{64}$"
  ) {
    throw new Error(`Unexpected BlobHash schema:\n${JSON.stringify(blobHash, null, 2)}`);
  }

  const uploadResponse = findDeclaration(content.declarations, "Schema", "BlobUploadResponse");
  const responseSchema =
    uploadResponse.schema?.kind === "Annotated"
      ? uploadResponse.schema.schema
      : uploadResponse.schema;
  const responseFields = responseSchema?.fields;
  if (!Array.isArray(responseFields) || responseFields.length !== 6) {
    throw new Error(
      `BlobUploadResponse should have six fields:\n${JSON.stringify(uploadResponse, null, 2)}`,
    );
  }
  if (findField(responseFields, "filename").schema?.kind !== "Optional") {
    throw new Error(`filename should be optional:\n${JSON.stringify(uploadResponse, null, 2)}`);
  }

  const notFound = findDeclaration(content.declarations, "Schema", "DatabaseNotFound");
  if (notFound.schemaKind !== "Error" || notFound.schema?.annotations?.status !== 404) {
    throw new Error(`Unexpected DatabaseNotFound error:\n${JSON.stringify(notFound, null, 2)}`);
  }

  const httpApi = findDeclaration(content.declarations, "HttpApi", "blobs");
  const group = httpApi.groups?.[0];
  const upload = group?.endpoints?.find((endpoint) => endpoint.name === "upload");
  const metadata = group?.endpoints?.find((endpoint) => endpoint.name === "metadata");
  if (
    group?.pathParams?.length !== 2 ||
    group.pathParams[1]?.schema?.target !== "BlobHash" ||
    upload?.method !== "POST" ||
    upload?.payload?.prim !== "Uint8Array" ||
    upload?.query?.fields?.length !== 2 ||
    upload?.success?.target !== "BlobUploadResponse" ||
    upload?.errors?.length !== 3 ||
    metadata?.path !== "/db/{database}/blobs/{hash}/metadata"
  ) {
    throw new Error(`Unexpected HttpApi IR:\n${JSON.stringify(httpApi, null, 2)}`);
  }

  expectOk(
    `loadSource ${invalidSourceId}`,
    await request({
      op: "loadSource",
      sessionId,
      sourceId: invalidSourceId,
      source: invalidSource,
    }),
  );

  const invalid = await request({
    op: "emit",
    sessionId,
    backend: "canonical-ir",
    sourceId: invalidSourceId,
  });

  if (
    invalid?.ok !== false ||
    invalid.diagnostics?.[0]?.code !== "http/undeclared-path-param" ||
    !invalid.diagnostics[0]?.message?.includes("hash")
  ) {
    throw new Error(
      `Expected undeclared path-param diagnostic:\n${JSON.stringify(invalid, null, 2)}`,
    );
  }

  expectOk(
    `loadSource ${unknownSchemaSourceId}`,
    await request({
      op: "loadSource",
      sessionId,
      sourceId: unknownSchemaSourceId,
      source: unknownSchemaSource,
    }),
  );

  const unknownSchema = await request({
    op: "emit",
    sessionId,
    backend: "canonical-ir",
    sourceId: unknownSchemaSourceId,
  });

  if (
    unknownSchema?.ok !== false ||
    unknownSchema.diagnostics?.[0]?.code !== "http/unknown-schema-ref" ||
    !unknownSchema.diagnostics[0]?.message?.includes("MissingResponse")
  ) {
    throw new Error(
      `Expected unknown schema diagnostic:\n${JSON.stringify(unknownSchema, null, 2)}`,
    );
  }

  expectOk(
    `loadSource ${undeclaredErrorSourceId}`,
    await request({
      op: "loadSource",
      sessionId,
      sourceId: undeclaredErrorSourceId,
      source: undeclaredErrorSource,
    }),
  );

  const undeclaredError = await request({
    op: "emit",
    sessionId,
    backend: "canonical-ir",
    sourceId: undeclaredErrorSourceId,
  });

  if (
    undeclaredError?.ok !== false ||
    undeclaredError.diagnostics?.[0]?.code !== "http/undeclared-error" ||
    !undeclaredError.diagnostics[0]?.message?.includes("PlainProblem")
  ) {
    throw new Error(
      `Expected undeclared endpoint error diagnostic:\n${JSON.stringify(undeclaredError, null, 2)}`,
    );
  }
} catch (error) {
  hardFailure = error;
} finally {
  if (sessionId) {
    try {
      await request({ op: "closeSession", sessionId });
    } catch {
      // The daemon may already be closing after an earlier hard failure.
    }
  }
  daemon.stdin.end();
}

const exitCode = await new Promise((resolveExit) => daemon.on("close", resolveExit));
if (exitCode !== 0) {
  throw new Error(`Daemon exited with ${exitCode}: ${stderr}`);
}

if (hardFailure) {
  console.error(`language-ocaml HTTP API check failed: ${hardFailure.message}`);
  process.exit(1);
}

console.log("language-ocaml http-api ok (schemas, errors, endpoints, path/ref diagnostics)");
