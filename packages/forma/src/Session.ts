/**
 * Session state for loaded sources, parse caches, and language environment.
 *
 * @module Session
 */

export {
  LanguageSession,
  openSession,
  sessionInfo,
  type LanguageSessionOptions,
  type SessionInfo,
  type SessionSourceInput,
  type SessionSourceKind,
  type SessionSourceRecord,
  type SessionSourceSummary,
} from "./session/session.js";
