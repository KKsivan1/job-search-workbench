// Default entry (local mode). The cloud build swaps this module for
// ./api-entry.cloud.ts via the resolveAlias in next.config.ts.
export { localApi as api } from "./local-api";
