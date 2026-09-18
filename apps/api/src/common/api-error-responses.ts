import { applyDecorators } from "@nestjs/common";
import { ApiResponse } from "@nestjs/swagger";

// Mirrors AllExceptionsFilter's actual response envelope exactly — every
// thrown exception (Nest's own HttpException subclasses, or anything else)
// is normalized to this shape at runtime, so this is what a caller genuinely
// receives, not an idealized/aspirational schema.
const ERROR_ENVELOPE_SCHEMA = {
  type: "object",
  properties: {
    statusCode: { type: "integer" },
    error: { type: "string" },
    message: {
      oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }],
    },
    correlationId: { type: "string" },
    timestamp: { type: "string", format: "date-time" },
    path: { type: "string" },
  },
  required: ["statusCode", "error", "message", "timestamp", "path"],
};

const STANDARD_DESCRIPTIONS: Record<number, string> = {
  400: "Request validation failed (ZodValidationPipe), or a business rule rejected the request",
  401: "No valid session — the session cookie is missing, expired, or was revoked",
  403: "Authenticated but missing the required permission, or the CSRF token was missing/invalid",
  404: "The requested resource does not exist (or, where object-level authorization applies, exists but isn't the caller's)",
  409: "The request conflicts with the resource's current state",
  429: "Rate limit exceeded for this endpoint",
  503: "A dependency (e.g. the database) is unreachable",
};

// One shared schema/description reused across every status code documented
// on every endpoint — mirrors how ApiZodQuery/ApiZodParam (zod-openapi.ts)
// reuse one conversion for every route's params rather than redefining the
// shape per call site. Pass only the status codes a given endpoint's guard
// chain and service logic can actually produce (verified against the real
// thrown exceptions, not a blanket "document everything" default) — e.g.
// @ApiErrorResponses(400, 404) for a @Public read endpoint with no auth.
export function ApiErrorResponses(...statusCodes: number[]): MethodDecorator {
  const decorators = statusCodes.map((status) =>
    ApiResponse({
      status,
      description: STANDARD_DESCRIPTIONS[status] ?? "Error",
      schema: ERROR_ENVELOPE_SCHEMA,
    }),
  );
  return applyDecorators(...decorators);
}
