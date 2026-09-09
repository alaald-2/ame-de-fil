import { applyDecorators } from "@nestjs/common";
import { ApiQuery, ApiParam } from "@nestjs/swagger";
import { createSchema } from "zod-openapi";
import type { ZodObject, ZodRawShape, ZodType } from "zod";

// Bridges Zod schemas to @nestjs/swagger's `schema` option — `nestjs-zod`
// (which would normally do this) doesn't support Nest 12 yet (verified
// against npm; DECISIONS.md ADR — see apps/api's Phase 1 checkpoint report).
// zod-openapi has no Nest coupling at all, just a plain schema converter.
export function toOpenApiSchema(schema: ZodType): Record<string, unknown> {
  return createSchema(schema).schema as Record<string, unknown>;
}

interface JsonSchemaObject {
  type?: string;
  properties?: Record<string, Record<string, unknown>>;
  required?: string[];
}

// A ZodValidationPipe on @Query()/@Param() makes validation real, but
// @nestjs/swagger only documents parameters declared via its own
// decorators — it has no way to see inside a pipe. Without this, the
// generated OpenAPI document (and therefore packages/types' typed client)
// silently has no query/param parameters at all, even though the endpoint
// genuinely requires and validates them (caught while wiring the storefront
// to the real generated client — TS rejected `query` as unassignable to
// `undefined`, which is what an undocumented parameter looks like).
export function ApiZodQuery(schema: ZodObject<ZodRawShape>): MethodDecorator {
  const { schema: jsonSchema } = createSchema(schema) as { schema: JsonSchemaObject };
  const properties = jsonSchema.properties ?? {};
  const required = new Set(jsonSchema.required ?? []);

  const decorators = Object.entries(properties).map(([name, propSchema]) =>
    ApiQuery({ name, required: required.has(name), schema: propSchema }),
  );
  return applyDecorators(...decorators);
}

export function ApiZodParam(schema: ZodObject<ZodRawShape>): MethodDecorator {
  const { schema: jsonSchema } = createSchema(schema) as { schema: JsonSchemaObject };
  const properties = jsonSchema.properties ?? {};
  const required = new Set(jsonSchema.required ?? []);

  const decorators = Object.entries(properties).map(([name, propSchema]) =>
    ApiParam({ name, required: required.has(name), schema: propSchema }),
  );
  return applyDecorators(...decorators);
}
