import { describe, expect, it } from "vitest";
import { Prisma } from "@ame-de-fil/database";
import { isUniqueConstraintViolation } from "./prisma-errors.ts";

function makeClassicP2002(target: string[] | string) {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "7.0.0",
    meta: { target },
  });
}

// The real shape produced by @prisma/adapter-pg (Prisma 7, ADR-009) —
// confirmed by direct inspection against a live Postgres instance, not
// guessed. There is no `target` field at all under this shape.
function makeAdapterP2002(modelName: string, table: string, index: string) {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "7.10.0",
    meta: {
      modelName,
      driverAdapterError: { cause: { constraint: { index }, table } },
    },
  });
}

describe("isUniqueConstraintViolation", () => {
  describe("classic meta.target shape (backward compatibility)", () => {
    it("matches when the array target includes the field", () => {
      expect(
        isUniqueConstraintViolation(makeClassicP2002(["orderNumber"]), "Order", "orderNumber"),
      ).toBe(true);
    });

    it("does not match a different field in an array target", () => {
      expect(
        isUniqueConstraintViolation(makeClassicP2002(["key"]), "IdempotencyKey", "orderNumber"),
      ).toBe(false);
    });

    it("matches when the string target contains the field name", () => {
      expect(
        isUniqueConstraintViolation(
          makeClassicP2002("Order_orderNumber_key"),
          "Order",
          "orderNumber",
        ),
      ).toBe(true);
    });
  });

  describe("@prisma/adapter-pg shape (Prisma 7, ADR-009)", () => {
    it("matches a real WebhookEvent_pkey violation for the id field", () => {
      const error = makeAdapterP2002("WebhookEvent", "WebhookEvent", "WebhookEvent_pkey");
      expect(isUniqueConstraintViolation(error, "WebhookEvent", "id")).toBe(true);
    });

    it("matches a named unique-constraint violation (Order_orderNumber_key)", () => {
      const error = makeAdapterP2002("Order", "Order", "Order_orderNumber_key");
      expect(isUniqueConstraintViolation(error, "Order", "orderNumber")).toBe(true);
    });

    it("matches IdempotencyKey's own primary key (a @id column literally named 'key')", () => {
      const error = makeAdapterP2002("IdempotencyKey", "IdempotencyKey", "IdempotencyKey_pkey");
      expect(isUniqueConstraintViolation(error, "IdempotencyKey", "key")).toBe(true);
    });

    it("does not match a different model's primary-key violation — regression for the '_pkey ends in key' false-match", () => {
      // Every model's primary-key constraint ends in "_pkey", which contains
      // the substring "key" — a naive index.includes(field) check would
      // wrongly match this WebhookEvent violation against an unrelated
      // IdempotencyKey("key") check. Requiring the table to equal the
      // caller's expected model name is exactly what prevents that.
      const error = makeAdapterP2002("WebhookEvent", "WebhookEvent", "WebhookEvent_pkey");
      expect(isUniqueConstraintViolation(error, "IdempotencyKey", "key")).toBe(false);
    });

    it("does not match a real constraint violation on an unrelated field of the same model", () => {
      const error = makeAdapterP2002("Order", "Order", "Order_orderNumber_key");
      expect(isUniqueConstraintViolation(error, "Order", "guestEmail")).toBe(false);
    });
  });

  it("returns false for a non-P2002 Prisma error", () => {
    const error = new Prisma.PrismaClientKnownRequestError("Not found", {
      code: "P2025",
      clientVersion: "7.0.0",
    });
    expect(isUniqueConstraintViolation(error, "Order", "orderNumber")).toBe(false);
  });

  it("returns false for a plain Error", () => {
    expect(isUniqueConstraintViolation(new Error("boom"), "Order", "orderNumber")).toBe(false);
  });
});
