import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";

interface ErrorResponseBody {
  statusCode: number;
  error: string;
  message: string | string[];
  correlationId: string | undefined;
  timestamp: string;
  path: string;
  [key: string]: unknown;
}

// Consistent envelope for every error response, whatever threw it — the
// brief's requirement is "consistent API error handling," not just handling
// Nest's own HttpException subclasses. Extra keys on a thrown exception's
// response object (e.g. HealthController's { status, checks } on a 503) are
// preserved alongside the envelope rather than discarded, so a caller doesn't
// lose diagnostic detail just because it doesn't fit { error, message }.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { statusCode, error, message, extra } = this.resolve(exception);

    const body: ErrorResponseBody = {
      ...extra,
      statusCode,
      error,
      message,
      correlationId: request.id,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `Unhandled exception on ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(statusCode).json(body);
  }

  private resolve(exception: unknown): {
    statusCode: number;
    error: string;
    message: string | string[];
    extra?: Record<string, unknown>;
  } {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      const statusCode = exception.getStatus();
      if (typeof response === "string") {
        return { statusCode, error: exception.name, message: response };
      }

      const { error, message, statusCode: _omit, ...extra } = response as Record<string, unknown>;
      return {
        statusCode,
        error: typeof error === "string" ? error : exception.name,
        message: (message as string | string[] | undefined) ?? exception.message,
        extra,
      };
    }

    // Never leak internal error details (stack traces, DB errors) to the client.
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: "InternalServerError",
      message: "An unexpected error occurred",
    };
  }
}
