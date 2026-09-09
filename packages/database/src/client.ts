// Single public entrypoint for consumers (apps/api only — DATABASE.md / this
// boundary is enforced by not depending on this package elsewhere). Only the
// class and types are exported here, not a live instance: constructing the
// client with a driver adapter is the consuming app's job, via its own
// dependency-injection lifecycle (apps/api/src/database/prisma.service.ts),
// not a side effect of importing this module.
export * from "../generated/prisma/client.ts";
