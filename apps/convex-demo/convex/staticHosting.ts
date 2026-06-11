import {
  exposeUploadApi,
  exposeDeploymentQuery,
} from "@convex-dev/static-hosting";
import { components } from "./_generated/api";

// Internal upload/GC API used by the `static-hosting` CLI (only callable via an
// authenticated `npx convex run`). This module is named `staticHosting` because
// the CLI's default --component is `staticHosting` and it invokes
// `staticHosting:generateUploadUrl`, `staticHosting:recordAsset`, etc.
export const {
  generateUploadUrl,
  generateUploadUrls,
  recordAsset,
  recordAssets,
  gcOldAssets,
  listAssets,
} = exposeUploadApi(components.selfHosting);

// Public query clients can subscribe to for live-reload-on-deploy.
export const { getCurrentDeployment } = exposeDeploymentQuery(
  components.selfHosting,
);
