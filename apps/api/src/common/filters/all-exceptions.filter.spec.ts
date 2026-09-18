import { describe, expect, it, vi, afterEach } from "vitest";
import { HttpException, HttpStatus, Logger, ServiceUnavailableException } from "@nestjs/common";
import type { ArgumentsHost } from "@nestjs/common";
import type { Request, Response } from "express";
import { AllExceptionsFilter } from "./all-exceptions.filter.ts";

function makeHost(request: Partial<Request>, response: Partial<Response>): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
}

function makeResponse() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  return { status, json } as unknown as Response & { status: typeof status; json: typeof json };
}

describe("AllExceptionsFilter — sanitizes request.url before logging or returning it", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redacts a sensitive query param from the response body's path field", () => {
    const filter = new AllExceptionsFilter();
    const response = makeResponse();
    const request = {
      id: "req-1",
      method: "GET",
      url: "/api/v1/auth/google/callback?code=FAKE_SECRET&state=s",
    };

    filter.catch(
      new HttpException("bad request", HttpStatus.BAD_REQUEST),
      makeHost(request, response),
    );

    const body = response.json.mock.calls[0]?.[0];
    expect(body.path).toBe("/api/v1/auth/google/callback?code=[REDACTED]&state=s");
    expect(JSON.stringify(body)).not.toContain("FAKE_SECRET");
  });

  it("redacts the same sensitive query param from the logged message for a >=500 exception", () => {
    const errorSpy = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const filter = new AllExceptionsFilter();
    const response = makeResponse();
    const request = {
      id: "req-2",
      method: "GET",
      url: "/api/v1/auth/google/callback?code=FAKE_SECRET_2&state=s",
    };

    filter.catch(
      new ServiceUnavailableException({ error: "OAuthNotConfigured", message: "not configured" }),
      makeHost(request, response),
    );

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const loggedMessage = errorSpy.mock.calls[0]?.[0] as string;
    expect(loggedMessage).not.toContain("FAKE_SECRET_2");
    expect(loggedMessage).toContain("code=[REDACTED]");
  });

  it("does not log at all for a sub-500 exception, and the path is still sanitized", () => {
    const errorSpy = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const filter = new AllExceptionsFilter();
    const response = makeResponse();
    const request = { id: "req-3", method: "GET", url: "/x?code=FAKE_SECRET_3" };

    filter.catch(new HttpException("not found", HttpStatus.NOT_FOUND), makeHost(request, response));

    expect(errorSpy).not.toHaveBeenCalled();
    const body = response.json.mock.calls[0]?.[0];
    expect(body.path).toBe("/x?code=[REDACTED]");
  });

  it("leaves a URL with no sensitive query param completely unchanged", () => {
    const filter = new AllExceptionsFilter();
    const response = makeResponse();
    const request = { id: "req-4", method: "GET", url: "/api/v1/health" };

    filter.catch(
      new HttpException("bad request", HttpStatus.BAD_REQUEST),
      makeHost(request, response),
    );

    const body = response.json.mock.calls[0]?.[0];
    expect(body.path).toBe("/api/v1/health");
  });
});
