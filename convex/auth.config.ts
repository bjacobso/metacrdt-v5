// Convex JWT authentication config.
//
// This repo already enforces server-derived write principals through
// ctx.auth.getUserIdentity(). Until a production auth provider is chosen, the
// backend intentionally accepts no JWT providers, so protected writes fail
// closed instead of trusting fake or spoofable identities.
//
// When a provider is selected, replace the empty list below with the provider
// entry documented in README.md.

export default {
  providers: [],
};
