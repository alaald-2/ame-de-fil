import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import pino from "pino";
import { PINO_REDACT_PATHS, pinoRedactCensor } from "./pino-redact.ts";

// A real pino logger, using the exact same redact config app.module.ts
// wires into LoggerModule.forRoot() (imported, not hand-copied — this is
// what makes this a regression test for the actual production config, not
// an approximation that could silently drift out of sync). Captures the
// real serialized JSON bytes pino writes, the same thing that would
// actually land in a log file/aggregator.
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

function makeLogger() {
  const stream = new CapturingStream();
  const logger = pino({ redact: { paths: PINO_REDACT_PATHS, censor: pinoRedactCensor } }, stream);
  return { logger, stream };
}

describe("pino-redact (real pino logger, captured output)", () => {
  it("removes cookie/authorization/x-csrf-token/set-cookie headers and the parsed query.code entirely", () => {
    const { logger, stream } = makeLogger();

    logger.info(
      {
        req: {
          headers: { cookie: "ame_session=SECRET_TOKEN", authorization: "Bearer SECRET", "x-csrf-token": "csrf-1" },
          query: { code: "PARSED_CODE_SECRET", state: "keep-me" },
          url: "/x?code=PARSED_CODE_SECRET&state=keep-me",
        },
        res: { headers: { "set-cookie": "ame_session=NEW_SECRET_TOKEN" } },
      },
      "request completed",
    );

    const output = stream.toString();
    for (const secret of ["SECRET_TOKEN", "Bearer SECRET", "csrf-1", "PARSED_CODE_SECRET", "NEW_SECRET_TOKEN"]) {
      expect(output).not.toContain(secret);
    }
    expect(output).toContain("keep-me"); // state survives — not a credential
  });

  it("sanitizes only the code value inside req.url, leaving the path and other params intact", () => {
    const { logger, stream } = makeLogger();

    logger.info(
      { req: { url: "/api/v1/auth/google/callback?code=FAKE_OAUTH_CODE_XYZ&state=real-state" } },
      "request completed",
    );

    const output = stream.toString();
    expect(output).not.toContain("FAKE_OAUTH_CODE_XYZ");
    expect(output).toContain("/api/v1/auth/google/callback");
    expect(output).toContain("real-state");
    expect(output).toContain("code=[REDACTED]");
  });

  // The whole reason this is a censor function on `req.url` rather than a
  // `serializers.req` override (which was tried first and reverted,
  // DECISIONS.md ADR-033) — this proves remoteAddress/remotePort survive.
  it("never touches remoteAddress/remotePort — only redact paths are affected", () => {
    const { logger, stream } = makeLogger();

    logger.info(
      {
        req: {
          url: "/api/v1/auth/google/callback?code=FAKE_CODE&state=s",
          remoteAddress: "::1",
          remotePort: 54321,
        },
      },
      "request completed",
    );

    const output = stream.toString();
    expect(output).not.toContain("FAKE_CODE");
    expect(output).toContain('"remoteAddress":"::1"');
    expect(output).toContain('"remotePort":54321');
  });

  it("leaves a request with no sensitive fields at all completely unaffected", () => {
    const { logger, stream } = makeLogger();

    logger.info({ req: { url: "/health", query: {} } }, "request completed");

    const output = stream.toString();
    expect(output).toContain('"url":"/health"');
  });
});
