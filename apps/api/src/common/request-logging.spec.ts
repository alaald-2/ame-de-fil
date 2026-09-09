// Regression test for the live-caught OAuth-code-in-logs gap (DECISIONS.md
// ADR-033): a real Nest application, with the exact same pino-http
// redact config app.module.ts wires into production (imported, not
// hand-copied), handling a real HTTP request shaped exactly like Google's
// callback redirect. Proves the fake `code` value never reaches the
// captured log bytes, while `state` and `remoteAddress` — neither of which
// is a credential — do, confirming this isn't an over-broad redaction that
// would also have hidden useful debugging fields.
import { Writable } from "node:stream";
import { describe, expect, it, afterEach } from "vitest";
import { Test } from "@nestjs/testing";
import { Controller, Get, Query, type INestApplication } from "@nestjs/common";
import { LoggerModule, Logger } from "nestjs-pino";
import cookieParser from "cookie-parser";
import supertest from "supertest";
import { PINO_REDACT_PATHS, pinoRedactCensor } from "./pino-redact.ts";

class CapturingStream extends Writable {
  private chunks: Buffer[] = [];

  override _write(chunk: Buffer, _encoding: string, callback: (error?: Error | null) => void): void {
    this.chunks.push(chunk);
    callback();
  }

  override toString(): string {
    return Buffer.concat(this.chunks).toString("utf8");
  }
}

// Stands in for AuthController.googleCallback's route shape — this test is
// about the logging pipeline, not AuthController's own business logic
// (already covered by auth.controller.spec.ts), so a minimal controller
// with the same path/query parameters is enough to exercise the same
// pino-http request-serialization path a real callback request takes.
@Controller("auth/google")
class FakeGoogleCallbackController {
  @Get("callback")
  callback(@Query("code") _code: string, @Query("state") _state: string): { ok: true } {
    return { ok: true };
  }
}

describe("Real HTTP request logging — GET /auth/google/callback with a fake OAuth code", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("never writes the code value into the captured log output, while state and remoteAddress remain", async () => {
    const stream = new CapturingStream();
    const moduleRef = await Test.createTestingModule({
      imports: [
        LoggerModule.forRoot({
          pinoHttp: {
            stream,
            autoLogging: true,
            redact: { paths: PINO_REDACT_PATHS, censor: pinoRedactCensor },
          },
        }),
      ],
      controllers: [FakeGoogleCallbackController],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useLogger(app.get(Logger));
    await app.init();

    const response = await supertest(app.getHttpServer()).get(
      "/auth/google/callback?code=FAKE_OAUTH_CODE_LIVE_TEST&state=real-state-9",
    );
    expect(response.status).toBe(200);

    const output = stream.toString();
    expect(output).not.toContain("FAKE_OAUTH_CODE_LIVE_TEST");
    expect(output).toContain("code=[REDACTED]");
    expect(output).toContain("real-state-9");
    expect(output).toMatch(/"remoteAddress":"(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)"/);
  });
});
