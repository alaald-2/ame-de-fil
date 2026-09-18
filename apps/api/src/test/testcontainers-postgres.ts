import { execFileSync } from "node:child_process";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { PrismaService } from "../database/prisma.service.ts";

// TESTING.md §3 ("Integration tests (Vitest + Testcontainers)") — real
// Postgres, not a mocked Prisma client, specifically because mocking the DB
// would defeat the point of testing concurrency/constraint-shape logic
// (exactly the class of bug this suite exists to catch — see
// reservation-expiry-race.integration.spec.ts). Pinned to postgres:18 to
// match docker-compose.yml / the documented production target
// (ARCHITECTURE.md).
const POSTGRES_IMAGE = "postgres:18";

export interface TestDatabase {
  prisma: PrismaService;
  container: StartedPostgreSqlContainer;
}

// Runs the project's real migrations (never `db push`, matching
// CONTRIBUTING.md's "Database changes" rule) against the ephemeral
// container via the same `prisma migrate deploy` command production uses —
// this proves the committed migration files are what's actually being
// tested, not a schema regenerated some other way.
function runMigrations(connectionUri: string): void {
  execFileSync(
    "pnpm",
    ["--filter", "@ame-de-fil/database", "exec", "prisma", "migrate", "deploy"],
    {
      env: { ...process.env, DATABASE_URL: connectionUri },
      stdio: "pipe",
    },
  );
}

// Sets DATABASE_URL to the container's connection string and constructs a
// real PrismaService the exact same way apps/api's own DI container does
// (PrismaService reads process.env.DATABASE_URL itself) — each Vitest test
// file runs in its own isolated worker (confirmed: this project's default
// per-file isolation), so this mutation never leaks across integration
// spec files.
export async function startTestDatabase(): Promise<TestDatabase> {
  const container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
  const connectionUri = container.getConnectionUri();
  runMigrations(connectionUri);

  process.env["DATABASE_URL"] = connectionUri;
  const prisma = new PrismaService();
  return { prisma, container };
}

export async function stopTestDatabase(db: TestDatabase): Promise<void> {
  await db.prisma.$disconnect();
  await db.container.stop();
}
