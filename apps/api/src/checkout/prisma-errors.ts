import { Prisma } from "@ame-de-fil/database";

// Prisma's P2002 `meta` shape depends on which query engine produced it —
// two shapes are handled here, both confirmed against real errors:
//
// 1. Classic query-engine shape: `meta.target` is either an array of the
//    violated column names, or a single descriptive string (often
//    including the constraint name) — this is what most Prisma docs/tests
//    assume, and what this project's own tests used to assert exclusively.
//
// 2. `@prisma/adapter-pg` shape (Prisma 7's engine-less client, ADR-009 —
//    what this project actually runs): there is no `meta.target` at all.
//    The violated Postgres index name instead lives at
//    `meta.driverAdapterError.cause.constraint.index`, alongside the table
//    name at `meta.driverAdapterError.cause.table`. Confirmed live shape:
//      { code: "P2002", meta: { driverAdapterError: { cause: {
//          constraint: { index: "WebhookEvent_pkey" }, table: "WebhookEvent"
//      } }, modelName: "WebhookEvent" } }
//
// For shape 2, the index name follows Prisma's own default Postgres
// naming convention: "<Model>_pkey" for the model's @id column, or
// "<Model>_<field>_key" for a named @unique column. Matching against
// those two exact, constructed names (not a loose substring check against
// the whole index) matters: `_pkey` constraints for *every* model end in
// the substring "key" (and models whose name itself contains "Key", like
// IdempotencyKey, make this worse), so a naive `index.includes(field)`
// would make an unrelated model's primary-key violation match a field
// check it has nothing to do with. Requiring the table to equal the
// caller's expected model name is what keeps this constraint/field-aware
// instead of turning every P2002 into a match for every requested field.
export function isUniqueConstraintViolation(
  error: unknown,
  modelName: string,
  field: string,
): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== "P2002") return false;

  const target = error.meta?.["target"];
  if (Array.isArray(target)) return target.includes(field);
  if (typeof target === "string") return target.includes(field);

  const driverAdapterError = error.meta?.["driverAdapterError"] as
    | { cause?: { constraint?: { index?: unknown }; table?: unknown } }
    | undefined;
  const cause = driverAdapterError?.cause;
  const index = cause?.constraint?.index;
  if (typeof index === "string" && cause?.table === modelName) {
    if (index === `${modelName}_pkey`) return true; // this model's own @id column
    if (index === `${modelName}_${field}_key`) return true; // a named @unique column
  }

  return false;
}
