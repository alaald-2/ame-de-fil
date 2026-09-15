import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Patch, Query, Req } from "@nestjs/common";
import { ApiBody, ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { CurrentUser } from "../common/decorators/current-user.decorator.ts";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator.ts";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.ts";
import { ApiErrorResponses } from "../common/api-error-responses.ts";
import { ApiZodParam, ApiZodQuery, toOpenApiSchema } from "../common/zod-openapi.ts";
import type { AuthContext } from "../common/types/auth-context.ts";
import { AdminTasksService } from "./admin-tasks.service.ts";
import { listTasksQuerySchema, type ListTasksQuery } from "./dto/list-tasks-query.dto.ts";
import { createTaskSchema, type CreateTaskInput } from "./dto/create-task.dto.ts";
import { updateTaskSchema, type UpdateTaskInput } from "./dto/update-task.dto.ts";
import { assignTaskSchema, type AssignTaskInput } from "./dto/assign-task.dto.ts";
import { taskIdParamSchema, type TaskIdParam } from "./dto/task-id.param.ts";
import {
  listTaskAssigneesResponseSchema,
  listTasksResponseSchema,
  taskResponseSchema,
} from "./dto/task-responses.ts";

// No @Public()/@OptionalAuth() — admin-only, default-deny like every other
// admin controller. Two permissions gate this controller (SECURITY.md §2):
// "tasks.view" (read-only list/detail/assignees) and "tasks.manage"
// (create/edit/assign/complete/reopen/cancel), same split shape as
// inventory.view/inventory.adjust.
@ApiTags("admin")
@ApiCookieAuth("ame_session")
@Controller("admin/tasks")
export class AdminTasksController {
  constructor(private readonly tasks: AdminTasksService) {}

  @Get()
  @RequirePermissions("tasks.view")
  @ApiOperation({ summary: "List tasks, soonest-due first (OPEN by default)" })
  @ApiZodQuery(listTasksQuerySchema)
  @ApiOkResponse({ schema: toOpenApiSchema(listTasksResponseSchema) })
  @ApiErrorResponses(400, 401, 403)
  async list(@Query(new ZodValidationPipe(listTasksQuerySchema)) query: ListTasksQuery, @CurrentUser() auth: AuthContext) {
    return this.tasks.list(query, auth.userId);
  }

  // Registered before ":id" — Nest matches routes in registration order,
  // and "assignees" would otherwise be swallowed by the ":id" param route.
  @Get("assignees")
  @RequirePermissions("tasks.view")
  @ApiOperation({ summary: "List active staff users eligible to be assigned a task" })
  @ApiOkResponse({ schema: toOpenApiSchema(listTaskAssigneesResponseSchema) })
  @ApiErrorResponses(401, 403)
  async listAssignees() {
    return this.tasks.listAssignees();
  }

  @Get(":id")
  @RequirePermissions("tasks.view")
  @ApiOperation({ summary: "Get one task" })
  @ApiZodParam(taskIdParamSchema)
  @ApiOkResponse({ schema: toOpenApiSchema(taskResponseSchema) })
  @ApiErrorResponses(400, 401, 403, 404)
  async getOne(@Param(new ZodValidationPipe(taskIdParamSchema)) params: TaskIdParam) {
    return this.tasks.getOne(params.id);
  }

  @Post()
  @RequirePermissions("tasks.manage")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Create a manual task" })
  @ApiBody({ schema: toOpenApiSchema(createTaskSchema) })
  @ApiOkResponse({ schema: toOpenApiSchema(taskResponseSchema) })
  @ApiErrorResponses(400, 401, 403)
  async create(
    @Body(new ZodValidationPipe(createTaskSchema)) body: CreateTaskInput,
    @CurrentUser() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.tasks.create(body, auth, request.ip);
  }

  @Patch(":id")
  @RequirePermissions("tasks.manage")
  @ApiOperation({ summary: "Edit a task's title/notes/due date" })
  @ApiZodParam(taskIdParamSchema)
  @ApiBody({ schema: toOpenApiSchema(updateTaskSchema) })
  @ApiOkResponse({ schema: toOpenApiSchema(taskResponseSchema) })
  @ApiErrorResponses(400, 401, 403, 404)
  async update(
    @Param(new ZodValidationPipe(taskIdParamSchema)) params: TaskIdParam,
    @Body(new ZodValidationPipe(updateTaskSchema)) body: UpdateTaskInput,
    @CurrentUser() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.tasks.update(params.id, body, auth, request.ip);
  }

  @Post(":id/assign")
  @RequirePermissions("tasks.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Assign, reassign, or unassign (assignedToUserId: null) a task" })
  @ApiZodParam(taskIdParamSchema)
  @ApiBody({ schema: toOpenApiSchema(assignTaskSchema) })
  @ApiOkResponse({ schema: toOpenApiSchema(taskResponseSchema) })
  @ApiErrorResponses(400, 401, 403, 404)
  async assign(
    @Param(new ZodValidationPipe(taskIdParamSchema)) params: TaskIdParam,
    @Body(new ZodValidationPipe(assignTaskSchema)) body: AssignTaskInput,
    @CurrentUser() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.tasks.assign(params.id, body.assignedToUserId, auth, request.ip);
  }

  @Post(":id/complete")
  @RequirePermissions("tasks.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Mark an OPEN task as done" })
  @ApiZodParam(taskIdParamSchema)
  @ApiOkResponse({ schema: toOpenApiSchema(taskResponseSchema) })
  @ApiErrorResponses(400, 401, 403, 404, 409)
  async complete(
    @Param(new ZodValidationPipe(taskIdParamSchema)) params: TaskIdParam,
    @CurrentUser() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.tasks.complete(params.id, auth, request.ip);
  }

  @Post(":id/reopen")
  @RequirePermissions("tasks.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Reopen a DONE or CANCELED task back to OPEN" })
  @ApiZodParam(taskIdParamSchema)
  @ApiOkResponse({ schema: toOpenApiSchema(taskResponseSchema) })
  @ApiErrorResponses(400, 401, 403, 404, 409)
  async reopen(
    @Param(new ZodValidationPipe(taskIdParamSchema)) params: TaskIdParam,
    @CurrentUser() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.tasks.reopen(params.id, auth, request.ip);
  }

  @Post(":id/cancel")
  @RequirePermissions("tasks.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Cancel an OPEN task" })
  @ApiZodParam(taskIdParamSchema)
  @ApiOkResponse({ schema: toOpenApiSchema(taskResponseSchema) })
  @ApiErrorResponses(400, 401, 403, 404, 409)
  async cancel(
    @Param(new ZodValidationPipe(taskIdParamSchema)) params: TaskIdParam,
    @CurrentUser() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.tasks.cancel(params.id, auth, request.ip);
  }
}
