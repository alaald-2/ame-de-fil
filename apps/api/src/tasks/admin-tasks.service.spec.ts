import { describe, expect, it, vi } from "vitest";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { TaskSource, TaskStatus, TaskType } from "@ame-de-fil/database";
import { AdminTasksService } from "./admin-tasks.service.ts";
import { AuditService } from "../audit/audit.service.ts";
import type { PrismaService } from "../database/prisma.service.ts";
import type { AuthContext } from "../common/types/auth-context.ts";

const ACTOR: AuthContext = { userId: "admin-1", sessionId: "s-1", csrfToken: "csrf", permissions: ["tasks.manage"] };

const BASE_TASK = {
  id: "task-1",
  type: TaskType.GENERAL,
  source: TaskSource.MANUAL,
  title: "Call supplier",
  notes: null,
  status: TaskStatus.OPEN,
  dueAt: null,
  completedAt: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  assignedTo: null,
  createdBy: null,
  customer: null,
  order: null,
  orderItem: null,
  variant: null,
};

function baseMock(overrides: Record<string, unknown> = {}) {
  return {
    task: {
      findMany: vi.fn().mockResolvedValue([BASE_TASK]),
      count: vi.fn().mockResolvedValue(1),
      findUnique: vi.fn().mockResolvedValue(BASE_TASK),
      create: vi.fn().mockResolvedValue(BASE_TASK),
      update: vi.fn().mockResolvedValue(BASE_TASK),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue({ id: "user-2" }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    ...overrides,
  };
}

function makeService(prismaOverrides: Record<string, unknown> = {}) {
  const prisma = baseMock(prismaOverrides) as unknown as PrismaService;
  return { service: new AdminTasksService(prisma, new AuditService(prisma)), prisma };
}

describe("AdminTasksService.list", () => {
  it("defaults to OPEN status and resolves assignee=me against the caller's own id", async () => {
    const { service, prisma } = makeService();
    await service.list({ page: 1, pageSize: 20, status: "OPEN", assignee: "me" } as never, "admin-1");

    const where = (prisma.task.findMany as ReturnType<typeof vi.fn>).mock.calls[0]![0].where;
    expect(where.status).toBe(TaskStatus.OPEN);
    expect(where.assignedToUserId).toBe("admin-1");
  });

  it("treats assignee=unassigned as assignedToUserId IS NULL", async () => {
    const { service, prisma } = makeService();
    await service.list({ page: 1, pageSize: 20, status: "ALL", assignee: "unassigned" } as never, "admin-1");

    const where = (prisma.task.findMany as ReturnType<typeof vi.fn>).mock.calls[0]![0].where;
    expect(where.status).toBeUndefined();
    expect(where.assignedToUserId).toBeNull();
  });
});

describe("AdminTasksService.getOne", () => {
  it("throws NotFoundException when the task doesn't exist", async () => {
    const { service } = makeService({ task: { findUnique: vi.fn().mockResolvedValue(null) } });
    await expect(service.getOne("missing")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("AdminTasksService.create", () => {
  it("always sets source=MANUAL and records a task.created audit entry", async () => {
    const { service, prisma } = makeService();
    await service.create({ type: "GENERAL", title: "Call supplier" } as never, ACTOR);

    expect((prisma.task.create as ReturnType<typeof vi.fn>).mock.calls[0]![0].data.source).toBe(TaskSource.MANUAL);
    expect((prisma.auditLog.create as ReturnType<typeof vi.fn>).mock.calls[0]![0].data.action).toBe("task.created");
  });
});

describe("AdminTasksService.assign", () => {
  it("records task.assigned when moving from unassigned to a real user", async () => {
    const { service, prisma } = makeService({
      task: { findUnique: vi.fn().mockResolvedValue({ id: "task-1", assignedToUserId: null }), update: vi.fn().mockResolvedValue(BASE_TASK) },
    });
    await service.assign("task-1", "user-2", ACTOR);
    expect((prisma.auditLog.create as ReturnType<typeof vi.fn>).mock.calls[0]![0].data.action).toBe("task.assigned");
  });

  it("records task.unassigned when clearing an existing assignee", async () => {
    const { service, prisma } = makeService({
      task: { findUnique: vi.fn().mockResolvedValue({ id: "task-1", assignedToUserId: "user-2" }), update: vi.fn().mockResolvedValue(BASE_TASK) },
    });
    await service.assign("task-1", null, ACTOR);
    expect((prisma.auditLog.create as ReturnType<typeof vi.fn>).mock.calls[0]![0].data.action).toBe("task.unassigned");
  });

  it("records task.reassigned when swapping between two different users", async () => {
    const { service, prisma } = makeService({
      task: {
        findUnique: vi.fn().mockResolvedValue({ id: "task-1", assignedToUserId: "user-2" }),
        update: vi.fn().mockResolvedValue(BASE_TASK),
      },
      user: { findUnique: vi.fn().mockResolvedValue({ id: "user-3" }) },
    });
    await service.assign("task-1", "user-3", ACTOR);
    expect((prisma.auditLog.create as ReturnType<typeof vi.fn>).mock.calls[0]![0].data.action).toBe("task.reassigned");
  });

  it("is a no-op (no write, no audit entry) when the assignee is unchanged", async () => {
    const { service, prisma } = makeService({
      task: {
        findUnique: vi.fn().mockResolvedValue({ ...BASE_TASK, assignedToUserId: "user-2" }),
        update: vi.fn(),
      },
    });
    await service.assign("task-1", "user-2", ACTOR);
    expect(prisma.task.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});

describe("AdminTasksService status transitions", () => {
  it("complete() succeeds from OPEN and records task.completed", async () => {
    const { service, prisma } = makeService({
      task: {
        findUnique: vi.fn().mockResolvedValue({ ...BASE_TASK, status: TaskStatus.OPEN }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    });
    await service.complete("task-1", ACTOR);
    expect((prisma.auditLog.create as ReturnType<typeof vi.fn>).mock.calls[0]![0].data.action).toBe("task.completed");
  });

  it("complete() throws ConflictException when the task is already DONE", async () => {
    const { service } = makeService({
      task: {
        findUnique: vi.fn().mockResolvedValue({ id: "task-1", status: TaskStatus.DONE }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    });
    await expect(service.complete("task-1", ACTOR)).rejects.toBeInstanceOf(ConflictException);
  });

  it("reopen() accepts both DONE and CANCELED as valid starting states", async () => {
    const { service, prisma } = makeService({
      task: {
        findUnique: vi.fn().mockResolvedValue({ ...BASE_TASK, status: TaskStatus.CANCELED }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    });
    await service.reopen("task-1", ACTOR);
    const call = (prisma.task.updateMany as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.where.status.in).toEqual([TaskStatus.DONE, TaskStatus.CANCELED]);
  });
});
