import { describe, expect, it } from "vitest";
import { Prisma } from "@ame-de-fil/database";
import { isUniqueConstraintViolation } from "./prisma-errors.ts";

function makeP2002(target: string[] | string) {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "7.0.0",
    meta: { target },
  });
}

describe("isUniqueConstraintViolation", () => {
  it("matches when the array target includes the field", () => {
    expect(isUniqueConstraintViolation(makeP2002(["orderNumber"]), "orderNumber")).toBe(true);
  });

  it("does not match a different field in an array target", () => {
    expect(isUniqueConstraintViolation(makeP2002(["key"]), "orderNumber")).toBe(false);
  });

  it("matches when the string target contains the field name", () => {
    expect(isUniqueConstraintViolation(makeP2002("Order_orderNumber_key"), "orderNumber")).toBe(
      true,
    );
  });

  it("returns false for a non-P2002 Prisma error", () => {
    const error = new Prisma.PrismaClientKnownRequestError("Not found", {
      code: "P2025",
      clientVersion: "7.0.0",
    });
    expect(isUniqueConstraintViolation(error, "orderNumber")).toBe(false);
  });

  it("returns false for a plain Error", () => {
    expect(isUniqueConstraintViolation(new Error("boom"), "orderNumber")).toBe(false);
  });
});
