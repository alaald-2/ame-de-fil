import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator.ts";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.ts";
import { ApiErrorResponses } from "../common/api-error-responses.ts";
import { ApiZodParam, ApiZodQuery, toOpenApiSchema } from "../common/zod-openapi.ts";
import { AdminCustomersService } from "./admin-customers.service.ts";
import { customerIdParamSchema, type CustomerIdParam } from "./dto/customer-id.param.ts";
import {
  listAdminCustomersQuerySchema,
  type ListAdminCustomersQuery,
} from "./dto/list-customers-query.dto.ts";
import {
  adminCustomerDetailResponseSchema,
  listAdminCustomersResponseSchema,
} from "./dto/admin-customer-responses.ts";

// No @Public()/@OptionalAuth() — admin-only, default-deny, same posture as
// every other admin controller. `customers.view` is its own permission —
// not folded into orders.view or any other existing one, since none of
// them are actually about viewing User/profile data (mirrors why
// audit.view and orders.view were each kept separate rather than reused).
@ApiTags("admin")
@ApiCookieAuth("ame_session")
@Controller("admin/customers")
export class AdminCustomersController {
  constructor(private readonly adminCustomers: AdminCustomersService) {}

  @Get()
  @RequirePermissions("customers.view")
  @ApiOperation({ summary: "List customers, most recently registered first" })
  @ApiZodQuery(listAdminCustomersQuerySchema)
  @ApiOkResponse({ schema: toOpenApiSchema(listAdminCustomersResponseSchema) })
  @ApiErrorResponses(400, 401, 403)
  async list(@Query(new ZodValidationPipe(listAdminCustomersQuerySchema)) query: ListAdminCustomersQuery) {
    return this.adminCustomers.list(query.page, query.pageSize, query.q);
  }

  @Get(":id")
  @RequirePermissions("customers.view")
  @ApiOperation({ summary: "Get customer profile detail, with recent order history" })
  @ApiZodParam(customerIdParamSchema)
  @ApiOkResponse({ schema: toOpenApiSchema(adminCustomerDetailResponseSchema) })
  @ApiErrorResponses(400, 401, 403, 404)
  async getOne(@Param(new ZodValidationPipe(customerIdParamSchema)) params: CustomerIdParam) {
    return this.adminCustomers.getDetail(params.id);
  }
}
