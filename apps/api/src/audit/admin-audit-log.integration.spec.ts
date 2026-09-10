// Integration test (TESTING.md §3 — Vitest + Testcontainers, real Postgres).
// Exercises the real, unmocked AdminAuditLogService against a real
// database — the actor FK join/resolution (including the onDelete:
// SetNull behavior when an actor User row is later deleted) and the
// select-shape leak check are exactly the kind of thing a mocked Prisma
// client can't actually verify.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { AdminAuditLogService } from "./admin-audit-log.service.ts";
import { AuditService } from "./audit.service.ts";
import { startTestDatabase, stopTestDatabase, type TestDatabase } from "../test/testcontainers-postgres.ts";
import { seedUserWithPermissions } from "../test/fixtures.ts";

describe("AdminAuditLogService — real Postgres", () => {
  let db: TestDatabase;
  let service: AdminAuditLogService;
  let audit: AuditService;

  beforeAll(async () => {
    db = await startTestDatabase();
    service = new AdminAuditLogService(db.prisma);
    audit = new AuditService(db.prisma);
  }, 120_000);

  afterAll(async () => {
    await stopTestDatabase(db);
  });

  it("lists a real recorded entry with the actor's email resolved via the FK relation", async () => {
    const actor = await seedUserWithPermissions(db.prisma, []);
    const entityId = `entity-${randomUUID()}`;
    await audit.record({
      actorUserId: actor.userId,
      action: "test.action",
      entityType: "TestEntity",
      entityId,
      before: { value: 1 },
      after: { value: 2 },
      ipAddress: "203.0.113.5",
    });

    const result = await service.list(1, 50);
    const entry = result.items.find((item) => item.entityId === entityId);

    expect(entry).toMatchObject({
      actorUserId: actor.userId,
      actorEmail: actor.email,
      action: "test.action",
      entityType: "TestEntity",
      before: { value: 1 },
      after: { value: 2 },
      ipAddress: "203.0.113.5",
    });
  });

  it("records with no before/after as null, not an empty object", async () => {
    const actor = await seedUserWithPermissions(db.prisma, []);
    const entityId = `entity-${randomUUID()}`;
    await audit.record({ actorUserId: actor.userId, action: "test.no-payload", entityType: "TestEntity", entityId });

    const result = await service.list(1, 50);
    const entry = result.items.find((item) => item.entityId === entityId);

    expect(entry?.before).toBeNull();
    expect(entry?.after).toBeNull();
  });

  it("resolves actorEmail to null once the actor User row is deleted (onDelete: SetNull)", async () => {
    const actor = await seedUserWithPermissions(db.prisma, []);
    const entityId = `entity-${randomUUID()}`;
    await audit.record({ actorUserId: actor.userId, action: "test.orphaned", entityType: "TestEntity", entityId });

    await db.prisma.user.delete({ where: { id: actor.userId } });

    const result = await service.list(1, 50);
    const entry = result.items.find((item) => item.entityId === entityId);

    // The real FK ON DELETE SET NULL behavior, not application code —
    // actorUserId itself is nulled by Postgres, so actorEmail (resolved
    // from the now-absent relation) can never disagree with it.
    expect(entry?.actorUserId).toBeNull();
    expect(entry?.actorEmail).toBeNull();
  });

  it("never leaks the actor's password hash anywhere in the response", async () => {
    const actor = await seedUserWithPermissions(db.prisma, []);
    const entityId = `entity-${randomUUID()}`;
    await audit.record({ actorUserId: actor.userId, action: "test.leak-check", entityType: "TestEntity", entityId });

    const result = await service.list(1, 50);
    const rawUser = await db.prisma.user.findUniqueOrThrow({ where: { id: actor.userId } });

    expect(rawUser.passwordHash).toBeTruthy();
    expect(JSON.stringify(result)).not.toContain(rawUser.passwordHash);
  });

  it("orders most recent first and paginates correctly", async () => {
    // AuditService.record always writes createdAt: now() by design (no
    // override param) — a direct insert is the only way to control it for
    // a deterministic ordering assertion. Year-2099 timestamps sort ahead
    // of anything else this file (or a shared container) has created.
    const future = (offsetMinutes: number) => new Date(Date.UTC(2099, 0, 1, 0, offsetMinutes));
    const entityIds = [`entity-${randomUUID()}`, `entity-${randomUUID()}`, `entity-${randomUUID()}`];
    for (const [i, entityId] of entityIds.entries()) {
      await db.prisma.auditLog.create({
        data: {
          actorUserId: null,
          action: "test.ordering",
          entityType: "TestEntity",
          entityId,
          createdAt: future(i),
        },
      });
    }

    const page1 = await service.list(1, 2);
    expect(page1.items.map((item) => item.entityId)).toEqual([entityIds[2], entityIds[1]]);

    const page2 = await service.list(2, 2);
    expect(page2.items[0]?.entityId).toBe(entityIds[0]);
  });

  it("total reflects the real row count, not a mocked/stale value", async () => {
    const before = await service.list(1, 1);
    await db.prisma.auditLog.create({
      data: { actorUserId: null, action: "test.count-a", entityType: "TestEntity", entityId: randomUUID() },
    });
    await db.prisma.auditLog.create({
      data: { actorUserId: null, action: "test.count-b", entityType: "TestEntity", entityId: randomUUID() },
    });
    const after = await service.list(1, 1);

    expect(after.total).toBe(before.total + 2);
  });
});
