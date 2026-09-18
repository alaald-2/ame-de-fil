import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import {
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import type { Request } from "express";
import type { z } from "zod";
import { CurrentUser } from "../common/decorators/current-user.decorator.ts";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator.ts";
import { RateLimit } from "../common/rate-limit/rate-limit.decorator.ts";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.ts";
import { ApiErrorResponses } from "../common/api-error-responses.ts";
import { ApiZodParam, ApiZodQuery, toOpenApiSchema } from "../common/zod-openapi.ts";
import { paginationQuerySchema } from "../common/dto/pagination.schema.ts";
import { searchQuerySchema } from "../common/dto/search-query.schema.ts";
import type { AuthContext } from "../common/types/auth-context.ts";
import { AdminUsersService } from "./admin-users.service.ts";
import { userIdParamSchema, type UserIdParam } from "./dto/user-id.param.ts";
import { userRoleIdParamSchema, type UserRoleIdParam } from "./dto/user-role-id.param.ts";
import { createUserSchema, type CreateUserInput } from "./dto/create-user.dto.ts";
import { assignRoleSchema, type AssignRoleInput } from "./dto/assign-role.dto.ts";
import {
  adminUserDetailResponseSchema,
  createUserResponseSchema,
  listAdminUsersResponseSchema,
} from "./dto/admin-user-responses.ts";

// `q` matches name (first or last) or email — see admin-users.service.ts's
// own list().
const listUsersQuerySchema = paginationQuerySchema.extend({ ...searchQuerySchema.shape });
type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

// No @Public()/@OptionalAuth() — admin-only, default-deny, same posture as
// every other admin controller. Three permissions gate this controller
// (SECURITY.md §2): `users.view` (list/detail — staff-only, never
// duplicates admin-customers' own full-User-table listing), `users.manage`
// (account lifecycle: create/activate/deactivate — cannot touch roles),
// and `users.manage_roles` (assign/remove roles — the one
// escalation-capable action, deliberately a separate, stricter permission
// from `users.manage`).
@ApiTags("admin")
@ApiCookieAuth("ame_session")
@Controller("admin/users")
export class AdminUsersController {
  constructor(private readonly adminUsers: AdminUsersService) {}

  @Get()
  @RequirePermissions("users.view")
  @ApiOperation({
    summary: "List staff users (accounts holding at least one role), most recently created first",
  })
  @ApiZodQuery(listUsersQuerySchema)
  @ApiOkResponse({ schema: toOpenApiSchema(listAdminUsersResponseSchema) })
  @ApiErrorResponses(400, 401, 403)
  async list(@Query(new ZodValidationPipe(listUsersQuerySchema)) query: ListUsersQuery) {
    return this.adminUsers.list(query.page, query.pageSize, query.q);
  }

  @Get(":id")
  @RequirePermissions("users.view")
  @ApiOperation({ summary: "Get a staff user's roles, effective permissions, and status" })
  @ApiZodParam(userIdParamSchema)
  @ApiOkResponse({ schema: toOpenApiSchema(adminUserDetailResponseSchema) })
  @ApiErrorResponses(400, 401, 403, 404)
  async getOne(@Param(new ZodValidationPipe(userIdParamSchema)) params: UserIdParam) {
    return this.adminUsers.getDetail(params.id);
  }

  // Rate-limited (unlike this controller's other mutations) — account
  // creation is a more classically abused operation than the lifecycle/
  // role actions below, all of which require already knowing a specific
  // existing user id.
  @Post()
  @RequirePermissions("users.manage")
  @RateLimit({ windowMs: 60_000, max: 5 })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Create a new staff user — password is server-generated and returned once",
  })
  @ApiBody({ schema: toOpenApiSchema(createUserSchema) })
  @ApiCreatedResponse({ schema: toOpenApiSchema(createUserResponseSchema) })
  @ApiErrorResponses(400, 401, 403, 404, 409, 429)
  async create(
    @Body(new ZodValidationPipe(createUserSchema)) body: CreateUserInput,
    @CurrentUser() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.adminUsers.createUser(body, auth, request.ip);
  }

  @Post(":id/activate")
  @RequirePermissions("users.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Reactivate a deactivated user" })
  @ApiZodParam(userIdParamSchema)
  @ApiOkResponse({ schema: toOpenApiSchema(adminUserDetailResponseSchema) })
  @ApiErrorResponses(400, 401, 403, 404, 409)
  async activate(
    @Param(new ZodValidationPipe(userIdParamSchema)) params: UserIdParam,
    @CurrentUser() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.adminUsers.activate(params.id, auth.userId, request.ip);
  }

  @Post(":id/deactivate")
  @RequirePermissions("users.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Deactivate a user and revoke their existing sessions" })
  @ApiZodParam(userIdParamSchema)
  @ApiOkResponse({ schema: toOpenApiSchema(adminUserDetailResponseSchema) })
  @ApiErrorResponses(400, 401, 403, 404, 409)
  async deactivate(
    @Param(new ZodValidationPipe(userIdParamSchema)) params: UserIdParam,
    @CurrentUser() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.adminUsers.deactivate(params.id, auth.userId, request.ip);
  }

  @Post(":id/roles")
  @RequirePermissions("users.manage_roles")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Assign an existing role to a user" })
  @ApiZodParam(userIdParamSchema)
  @ApiBody({ schema: toOpenApiSchema(assignRoleSchema) })
  @ApiOkResponse({ schema: toOpenApiSchema(adminUserDetailResponseSchema) })
  @ApiErrorResponses(400, 401, 403, 404, 409)
  async assignRole(
    @Param(new ZodValidationPipe(userIdParamSchema)) params: UserIdParam,
    @Body(new ZodValidationPipe(assignRoleSchema)) body: AssignRoleInput,
    @CurrentUser() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.adminUsers.assignRole(params.id, body.roleId, auth, request.ip);
  }

  @Delete(":id/roles/:roleId")
  @RequirePermissions("users.manage_roles")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Remove a role from a user" })
  @ApiZodParam(userRoleIdParamSchema)
  @ApiOkResponse({ schema: toOpenApiSchema(adminUserDetailResponseSchema) })
  @ApiErrorResponses(400, 401, 403, 404, 409)
  async removeRole(
    @Param(new ZodValidationPipe(userRoleIdParamSchema)) params: UserRoleIdParam,
    @CurrentUser() auth: AuthContext,
    @Req() request: Request,
  ) {
    return this.adminUsers.removeRole(params.id, params.roleId, auth.userId, request.ip);
  }
}
