import * as argon2 from "argon2";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, UserStatus } from "../generated/prisma/client.ts";

// The only controlled, documented way to bootstrap RBAC data in this
// project — no admin endpoint creates Role/Permission/RolePermission/
// UserRole rows (that's Phase 5 scope, DECISIONS.md), so without this
// script the only path was undocumented direct DB access. Run explicitly
// via `pnpm --filter @ame-de-fil/database run seed` (never auto-run by
// migrations, per Prisma 7's own `db seed` semantics) — see
// docs/DEPLOYMENT.md §1.
//
// Kept intentionally minimal: every permission key currently referenced
// by an `@RequirePermissions(...)` decorator in apps/api, granted to one
// "admin" role. SECURITY.md §2's finer-grained example roles (e.g.
// "support") aren't built yet — seeding them here would invent
// permissions no code actually checks.
const PERMISSION_KEYS = [
  "products.create",
  "inventory.view",
  "inventory.adjust",
  "checkout.manage",
  "orders.fulfill",
  "orders.view",
  "audit.view",
  "customers.view",
  "orders.refund",
  "users.view",
  "users.manage",
  "users.manage_roles",
  "dashboard.view",
] as const;

const ADMIN_ROLE_NAME = "admin";

function requireDatabaseUrl(): string {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not set");
  return url;
}

async function seedPermissionsAndAdminRole(prisma: PrismaClient): Promise<void> {
  for (const key of PERMISSION_KEYS) {
    await prisma.permission.upsert({ where: { key }, update: {}, create: { key } });
  }

  const adminRole = await prisma.role.upsert({
    where: { name: ADMIN_ROLE_NAME },
    update: {},
    create: {
      name: ADMIN_ROLE_NAME,
      description: "Full access to every permission currently defined.",
    },
  });

  const permissions = await prisma.permission.findMany({
    where: { key: { in: [...PERMISSION_KEYS] } },
  });
  for (const permission of permissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRole.id, permissionId: permission.id } },
      update: {},
      create: { roleId: adminRole.id, permissionId: permission.id },
    });
  }

  console.log(`Seeded ${permissions.length} permission(s) and the "${ADMIN_ROLE_NAME}" role.`);
}

// Opt-in and env-gated — same "disclosed rather than faked" posture as
// Stripe/SMTP/Google config (packages/config/src/env.ts): unset means this
// step is skipped entirely, never defaulted to a guessable credential.
// Never overwrites an existing user's password — a second run only makes
// sure the role link exists, so re-running this after rotating a real
// admin's password elsewhere can never silently revert it.
async function seedBootstrapAdminIfConfigured(prisma: PrismaClient): Promise<void> {
  const email = process.env["SEED_ADMIN_EMAIL"];
  const password = process.env["SEED_ADMIN_PASSWORD"];
  if (!email || !password) {
    console.log("SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD not set — skipping bootstrap admin user.");
    return;
  }

  const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: ADMIN_ROLE_NAME } });

  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    user = await prisma.user.create({
      data: { email, passwordHash, status: UserStatus.ACTIVE, emailVerifiedAt: new Date() },
    });
    console.log(`Created bootstrap admin user "${email}".`);
  }

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: adminRole.id } },
    update: {},
    create: { userId: user.id, roleId: adminRole.id },
  });
  console.log(`Ensured "${email}" holds the "${ADMIN_ROLE_NAME}" role.`);
}

async function main(): Promise<void> {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: requireDatabaseUrl() }) });
  try {
    await seedPermissionsAndAdminRole(prisma);
    await seedBootstrapAdminIfConfigured(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

await main();
