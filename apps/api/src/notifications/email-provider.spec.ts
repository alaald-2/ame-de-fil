import { describe, expect, it, vi, beforeEach } from "vitest";
import { ConfigService } from "@nestjs/config";
import type { Env } from "@ame-de-fil/config";

const sendMail = vi.fn();
const createTransport = vi.fn(() => ({ sendMail }));

vi.mock("nodemailer", () => ({
  default: { createTransport },
}));

// Imported after the mock so SmtpEmailProvider's constructor-time
// `nodemailer.createTransport` call resolves to the mock above.
const { SmtpEmailProvider, PendingEmailProvider } = await import("./email-provider.ts");

function makeConfig(values: Partial<Env>): ConfigService<Env, true> {
  return { get: (key: string) => values[key as keyof Env] } as unknown as ConfigService<Env, true>;
}

describe("SmtpEmailProvider", () => {
  beforeEach(() => {
    createTransport.mockClear();
    sendMail.mockClear();
  });

  it("creates a transport from SMTP_HOST/SMTP_PORT at construction time", () => {
    new SmtpEmailProvider(makeConfig({ SMTP_HOST: "localhost", SMTP_PORT: 1025 }));

    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: "localhost", port: 1025 }),
    );
  });

  it("defaults to port 587 when SMTP_PORT is unset", () => {
    new SmtpEmailProvider(makeConfig({ SMTP_HOST: "localhost" }));

    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ port: 587 }));
  });

  it("sends a message via the transport, defaulting the from address", async () => {
    sendMail.mockResolvedValue(undefined);
    const provider = new SmtpEmailProvider(makeConfig({ SMTP_HOST: "localhost", SMTP_PORT: 1025 }));

    await provider.send({
      to: "customer@example.com",
      subject: "Hi",
      html: "<p>Hi</p>",
      text: "Hi",
    });

    expect(sendMail).toHaveBeenCalledWith({
      from: "no-reply@amedefil.se",
      to: "customer@example.com",
      subject: "Hi",
      html: "<p>Hi</p>",
      text: "Hi",
    });
  });

  it("uses SMTP_FROM when configured", async () => {
    sendMail.mockResolvedValue(undefined);
    const provider = new SmtpEmailProvider(
      makeConfig({ SMTP_HOST: "localhost", SMTP_PORT: 1025, SMTP_FROM: "orders@amedefil.se" }),
    );

    await provider.send({
      to: "customer@example.com",
      subject: "Hi",
      html: "<p>Hi</p>",
      text: "Hi",
    });

    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ from: "orders@amedefil.se" }));
  });
});

describe("PendingEmailProvider", () => {
  it("throws instead of silently pretending to send", async () => {
    const provider = new PendingEmailProvider();

    await expect(
      provider.send({ to: "customer@example.com", subject: "Hi", html: "<p>Hi</p>", text: "Hi" }),
    ).rejects.toThrow("no email provider is configured");
  });
});
