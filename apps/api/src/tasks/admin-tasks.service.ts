import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, TaskSource, TaskStatus, TaskType, UserStatus } from "@ame-de-fil/database";
import { PrismaService } from "../database/prisma.service.ts";
import { AuditService } from "../audit/audit.service.ts";
import type { AuthContext } from "../common/types/auth-context.ts";
import { TASK_SELECT, mapTask } from "./mappers/task.mapper.ts";
import type { ListTasksQuery } from "./dto/list-tasks-query.dto.ts";
import type { CreateTaskInput } from "./dto/create-task.dto.ts";
import type { UpdateTaskInput } from "./dto/update-task.dto.ts";

const TASK_NOT_FOUND = () =>
  new NotFoundException({ error: "TaskNotFound", message: "Task not found" });
const ASSIGNEE_NOT_FOUND = () =>
  new BadRequestException({
    error: "AssigneeNotFound",
    message: "assignedToUserId does not match an existing user",
  });
const LINKED_ENTITY_NOT_FOUND = () =>
  new BadRequestException({
    error: "LinkedEntityNotFound",
    message:
      "One of orderId/orderItemId/productVariantId/customerUserId does not match an existing row",
  });

const P2003_FOREIGN_KEY_VIOLATION = "P2003";

// Admin Tasks CRUD/lifecycle (manual side). TaskAutomationService is the
// only other writer of this table — it never calls into this service, and
// this service never calls into TaskAutomationService, so the two paths
// can't interfere with each other's writes beyond both targeting the same
// table (which the dedupeKey/status guards on the automation side already
// account for).
@Injectable()
export class AdminTasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListTasksQuery, actorUserId: string) {
    const where: Prisma.TaskWhereInput = {};
    if (query.status !== "ALL") where.status = query.status as TaskStatus;
    if (query.type) where.type = query.type as TaskType;
    if (query.source) where.source = query.source as TaskSource;
    if (query.orderId) where.orderId = query.orderId;

    if (query.assignee === "unassigned") where.assignedToUserId = null;
    else if (query.assignee === "me") where.assignedToUserId = actorUserId;
    else if (query.assignee) where.assignedToUserId = query.assignee;

    if (query.dueBefore || query.dueFrom) {
      where.dueAt = {
        ...(query.dueFrom ? { gte: new Date(query.dueFrom) } : {}),
        ...(query.dueBefore ? { lt: new Date(query.dueBefore) } : {}),
      };
    }

    const [rows, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        select: TASK_SELECT,
        // Soonest-due first, same "most urgent first" convention as
        // inventory's listLowStock/listReservations — a null dueAt (a
        // GENERAL task with no deadline) sorts last, never masking
        // something that actually has a due date.
        orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.task.count({ where }),
    ]);

    return {
      items: rows.map(mapTask),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async getOne(id: string) {
    const task = await this.prisma.task.findUnique({ where: { id }, select: TASK_SELECT });
    if (!task) throw TASK_NOT_FOUND();
    return mapTask(task);
  }

  async listAssignees() {
    return this.prisma.user.findMany({
      where: { status: UserStatus.ACTIVE, roles: { some: {} } },
      select: { id: true, firstName: true, lastName: true, email: true },
      orderBy: [{ firstName: "asc" }, { email: "asc" }],
    });
  }

  async create(input: CreateTaskInput, actor: AuthContext, ipAddress?: string) {
    let created;
    try {
      created = await this.prisma.task.create({
        data: {
          type: input.type as TaskType,
          source: TaskSource.MANUAL,
          title: input.title,
          notes: input.notes,
          dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
          assignedToUserId: input.assignedToUserId,
          createdByUserId: actor.userId,
          orderId: input.orderId,
          orderItemId: input.orderItemId,
          productVariantId: input.productVariantId,
          customerUserId: input.customerUserId,
        },
        select: TASK_SELECT,
      });
    } catch (error) {
      if (this.isForeignKeyViolation(error)) throw LINKED_ENTITY_NOT_FOUND();
      throw error;
    }

    await this.audit.record({
      actorUserId: actor.userId,
      action: "task.created",
      entityType: "Task",
      entityId: created.id,
      after: {
        type: created.type,
        title: created.title,
        assignedToUserId: created.assignedTo?.id ?? null,
      },
      ipAddress,
    });

    return mapTask(created);
  }

  async update(id: string, input: UpdateTaskInput, actor: AuthContext, ipAddress?: string) {
    const existing = await this.prisma.task.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw TASK_NOT_FOUND();

    const updated = await this.prisma.task.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.dueAt !== undefined ? { dueAt: input.dueAt ? new Date(input.dueAt) : null } : {}),
      },
      select: TASK_SELECT,
    });

    await this.audit.record({
      actorUserId: actor.userId,
      action: "task.updated",
      entityType: "Task",
      entityId: id,
      after: { title: updated.title, notes: updated.notes, dueAt: updated.dueAt },
      ipAddress,
    });

    return mapTask(updated);
  }

  async assign(
    id: string,
    assignedToUserId: string | null,
    actor: AuthContext,
    ipAddress?: string,
  ) {
    const existing = await this.prisma.task.findUnique({
      where: { id },
      select: { id: true, assignedToUserId: true },
    });
    if (!existing) throw TASK_NOT_FOUND();

    if (assignedToUserId === existing.assignedToUserId) return this.getOne(id);

    if (assignedToUserId) {
      const assignee = await this.prisma.user.findUnique({
        where: { id: assignedToUserId },
        select: { id: true },
      });
      if (!assignee) throw ASSIGNEE_NOT_FOUND();
    }

    const action =
      existing.assignedToUserId === null
        ? "task.assigned"
        : assignedToUserId === null
          ? "task.unassigned"
          : "task.reassigned";

    const updated = await this.prisma.task.update({
      where: { id },
      data: { assignedToUserId },
      select: TASK_SELECT,
    });

    await this.audit.record({
      actorUserId: actor.userId,
      action,
      entityType: "Task",
      entityId: id,
      before: { assignedToUserId: existing.assignedToUserId },
      after: { assignedToUserId },
      ipAddress,
    });

    return mapTask(updated);
  }

  async complete(id: string, actor: AuthContext, ipAddress?: string) {
    return this.transition(
      id,
      [TaskStatus.OPEN],
      { status: TaskStatus.DONE, completedAt: new Date() },
      "task.completed",
      actor,
      ipAddress,
    );
  }

  async reopen(id: string, actor: AuthContext, ipAddress?: string) {
    return this.transition(
      id,
      [TaskStatus.DONE, TaskStatus.CANCELED],
      { status: TaskStatus.OPEN, completedAt: null },
      "task.reopened",
      actor,
      ipAddress,
    );
  }

  async cancel(id: string, actor: AuthContext, ipAddress?: string) {
    return this.transition(
      id,
      [TaskStatus.OPEN],
      { status: TaskStatus.CANCELED },
      "task.canceled",
      actor,
      ipAddress,
    );
  }

  // Guarded status transition — same "updateMany with a WHERE on the
  // expected current status, check the row count" shape admin-orders.service.ts
  // uses for its own fulfillment transitions, so a stale client double-click
  // (or a concurrent request) can never silently apply on top of an
  // already-transitioned task.
  private async transition(
    id: string,
    fromStatuses: TaskStatus[],
    data: Prisma.TaskUpdateManyMutationInput,
    action: string,
    actor: AuthContext,
    ipAddress?: string,
  ) {
    const existing = await this.prisma.task.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!existing) throw TASK_NOT_FOUND();

    const result = await this.prisma.task.updateMany({
      where: { id, status: { in: fromStatuses } },
      data,
    });
    if (result.count === 0) {
      throw new ConflictException({
        error: "InvalidTaskStatusTransition",
        message: `Task is currently ${existing.status}, which does not allow this action`,
      });
    }

    await this.audit.record({
      actorUserId: actor.userId,
      action,
      entityType: "Task",
      entityId: id,
      before: { status: existing.status },
      ipAddress,
    });

    return this.getOne(id);
  }

  private isForeignKeyViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === P2003_FOREIGN_KEY_VIOLATION
    );
  }
}
