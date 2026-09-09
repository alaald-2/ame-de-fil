import { Prisma } from "@ame-de-fil/database";

// Prisma's P2002 `meta.target` shape varies by connector/version — an
// array of column names on some, a single descriptive string (often
// including the constraint name) on others. Checking both keeps this
// correct regardless of which shape the installed client produces.
export function isUniqueConstraintViolation(error: unknown, field: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== "P2002") return false;

  const target = error.meta?.["target"];
  if (Array.isArray(target)) return target.includes(field);
  if (typeof target === "string") return target.includes(field);
  return false;
}
