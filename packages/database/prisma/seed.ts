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
  "products.view",
  "products.update",
  "products.delete",
  "categories.view",
  "categories.manage",
  "collections.view",
  "collections.manage",
  "promotions.view",
  "promotions.manage",
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
  "settings.view",
  "settings.manage",
  "marketing.view",
  "marketing.manage",
  "tasks.view",
  "tasks.manage",
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

// The "STANDARD" tax class was never seeded anywhere in this project's
// documented bootstrap path — only apps/api/src/test/fixtures.ts created
// it, for integration tests only. Every real ProductVariant requires a
// valid taxClassCode, and checkout/tax-rates.ts's SHIPPING_TAX_CLASS_CODE
// hard-requires this exact code to exist for shipping VAT calculation
// (throws if missing) — without this, product creation is impossible and
// checkout itself breaks on a genuinely fresh environment. 25% matches the
// Swedish standard VAT rate already assumed by that same file's own
// comment, not a new tax-policy decision made here.
async function seedTaxClasses(prisma: PrismaClient): Promise<void> {
  const taxClass = await prisma.taxClass.upsert({
    where: { code: "STANDARD" },
    update: {},
    create: { code: "STANDARD", name: "Standard 25%" },
  });

  const existingRate = await prisma.taxRate.findFirst({ where: { taxClassId: taxClass.id } });
  if (!existingRate) {
    await prisma.taxRate.create({
      data: { taxClassId: taxClass.id, ratePercent: 25.0, validFrom: new Date() },
    });
  }

  console.log(`Ensured the "${taxClass.code}" tax class and its current rate exist.`);
}

// Same gap as seedTaxClasses above, same fix — only apps/api/src/test/fixtures.ts
// ever created a ShippingMethod, for integration tests only. Order.shippingMethodId
// is a required, non-nullable FK, so checkout cannot complete on a genuinely
// fresh environment without at least one row here. Matches that fixture's
// exact code/name/price/delivery-window, not a new business decision made here.
async function seedShippingMethods(prisma: PrismaClient): Promise<void> {
  const shippingMethod = await prisma.shippingMethod.upsert({
    where: { code: "STANDARD" },
    update: {},
    create: {
      code: "STANDARD",
      nameSv: "Standardfrakt",
      nameEn: "Standard shipping",
      priceMinor: 4900,
      minDeliveryDays: 2,
      maxDeliveryDays: 5,
      isActive: true,
    },
  });

  // Demo pickup-point method (ADR-037) — exercises the requiresPickupPoint
  // flow end-to-end against ManualShippingProvider's fixture pickup points
  // until a real carrier (Shipmondo) is wired in. Carrier-agnostic naming
  // deliberately, same as STANDARD above (ADR-022): "Ombud" is a generic
  // Swedish delivery-type term, not a PostNord-specific one.
  const pickupMethod = await prisma.shippingMethod.upsert({
    where: { code: "OMBUD" },
    update: {},
    create: {
      code: "OMBUD",
      nameSv: "Ombud",
      nameEn: "Pickup point",
      priceMinor: 4900,
      minDeliveryDays: 1,
      maxDeliveryDays: 3,
      isActive: true,
      requiresPickupPoint: true,
    },
  });

  // ShipmondoShippingProvider's real, live-quoted product (DECISIONS.md
  // ADR-037's 2026-09-17 update) — code must match
  // shipmondo-shipping.provider.ts's SUPPORTED_PRODUCTS entry exactly, or
  // that provider silently has nothing to quote (its own listAvailableMethods
  // skips any configured product whose shippingMethodCode isn't seeded).
  // priceMinor/minDeliveryDays/maxDeliveryDays here are only
  // ManualShippingProvider's dev/test display fallback (live Shipmondo
  // price always wins when Shipmondo is configured) — priceMinor is a
  // rough placeholder, not the real DHL Freight rate (which varies by
  // destination/weight); minDeliveryDays/maxDeliveryDays are a reasonable
  // estimate for a domestic Sweden parcel carrier, not sourced from
  // Shipmondo's API (its expected_transit_time was null for this product/
  // route when checked).
  const shipmondoMethod = await prisma.shippingMethod.upsert({
    where: { code: "SHIPMONDO_DHLFSE_P" },
    update: {},
    create: {
      code: "SHIPMONDO_DHLFSE_P",
      nameSv: "DHL Freight – Paket",
      nameEn: "DHL Freight – Parcel",
      priceMinor: 9900,
      minDeliveryDays: 1,
      maxDeliveryDays: 3,
      isActive: true,
    },
  });

  console.log(
    `Ensured the "${shippingMethod.code}", "${pickupMethod.code}", and "${shipmondoMethod.code}" shipping methods exist.`,
  );
}

async function main(): Promise<void> {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: requireDatabaseUrl() }) });
  try {
    await seedPermissionsAndAdminRole(prisma);
    await seedBootstrapAdminIfConfigured(prisma);
    await seedTaxClasses(prisma);
    await seedShippingMethods(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

await main();
