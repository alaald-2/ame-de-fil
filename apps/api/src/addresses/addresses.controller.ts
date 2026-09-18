import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import {
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator.ts";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.ts";
import { ApiErrorResponses } from "../common/api-error-responses.ts";
import { ApiZodParam, toOpenApiSchema } from "../common/zod-openapi.ts";
import type { AuthContext } from "../common/types/auth-context.ts";
import { AddressesService } from "./addresses.service.ts";
import { addressIdParamSchema, type AddressIdParam } from "./dto/address-id.param.ts";
import { createAddressSchema, type CreateAddressInput } from "./dto/create-address.dto.ts";
import { updateAddressSchema, type UpdateAddressInput } from "./dto/update-address.dto.ts";
import { addressResponseSchema, listAddressesResponseSchema } from "./dto/address-responses.ts";

// No class-level @Public()/@OptionalAuth() — default-deny (SessionAuthGuard's
// own posture, SECURITY.md §2). "My own addresses," scoped entirely by
// AuthContext.userId — never permission-gated, the same posture as
// OrdersController's own "my orders" routes (not an admin privilege).
@ApiTags("addresses")
@ApiCookieAuth("ame_session")
@Controller("addresses")
export class AddressesController {
  constructor(private readonly addresses: AddressesService) {}

  @Get()
  @ApiOperation({ summary: "List the caller's own saved addresses" })
  @ApiOkResponse({ schema: toOpenApiSchema(listAddressesResponseSchema) })
  @ApiErrorResponses(401)
  async list(@CurrentUser() auth: AuthContext) {
    return this.addresses.listMyAddresses(auth.userId);
  }

  @Get(":addressId")
  @ApiOperation({ summary: "Get one of the caller's own saved addresses" })
  @ApiZodParam(addressIdParamSchema)
  @ApiOkResponse({ schema: toOpenApiSchema(addressResponseSchema) })
  @ApiErrorResponses(400, 401, 404)
  async getOne(
    @Param(new ZodValidationPipe(addressIdParamSchema)) params: AddressIdParam,
    @CurrentUser() auth: AuthContext,
  ) {
    return this.addresses.getMyAddress(auth.userId, params.addressId);
  }

  @Post()
  @ApiOperation({ summary: "Save a new address" })
  @ApiBody({ schema: toOpenApiSchema(createAddressSchema) })
  @ApiCreatedResponse({ schema: toOpenApiSchema(addressResponseSchema) })
  @ApiErrorResponses(400, 401, 422)
  async create(
    @Body(new ZodValidationPipe(createAddressSchema)) body: CreateAddressInput,
    @CurrentUser() auth: AuthContext,
  ) {
    return this.addresses.createAddress(auth.userId, body);
  }

  @Patch(":addressId")
  @ApiOperation({ summary: "Update one of the caller's own saved addresses" })
  @ApiZodParam(addressIdParamSchema)
  @ApiBody({ schema: toOpenApiSchema(updateAddressSchema) })
  @ApiOkResponse({ schema: toOpenApiSchema(addressResponseSchema) })
  @ApiErrorResponses(400, 401, 404)
  async update(
    @Param(new ZodValidationPipe(addressIdParamSchema)) params: AddressIdParam,
    @Body(new ZodValidationPipe(updateAddressSchema)) body: UpdateAddressInput,
    @CurrentUser() auth: AuthContext,
  ) {
    return this.addresses.updateAddress(auth.userId, params.addressId, body);
  }

  @Delete(":addressId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete one of the caller's own saved addresses" })
  @ApiZodParam(addressIdParamSchema)
  @ApiErrorResponses(400, 401, 404)
  async remove(
    @Param(new ZodValidationPipe(addressIdParamSchema)) params: AddressIdParam,
    @CurrentUser() auth: AuthContext,
  ) {
    await this.addresses.deleteAddress(auth.userId, params.addressId);
  }
}
