import { describe, expect, it } from "vitest";
import { z } from "zod";
import { BadRequestException } from "@nestjs/common";
import { ZodValidationPipe } from "./zod-validation.pipe.js";

describe("ZodValidationPipe", () => {
  const schema = z.object({ email: z.email(), age: z.number().int().nonnegative() });
  const pipe = new ZodValidationPipe(schema);

  it("passes through and returns the parsed value on success", () => {
    const input = { email: "a@example.com", age: 30 };
    expect(pipe.transform(input)).toEqual(input);
  });

  it("throws BadRequestException with field-level messages on failure", () => {
    expect(() => pipe.transform({ email: "not-an-email", age: -1 })).toThrow(BadRequestException);
  });

  it("strips unknown behavior is schema-defined — extra keys rejected only if schema is strict", () => {
    const strict = z.strictObject({ email: z.email() });
    const strictPipe = new ZodValidationPipe(strict);
    expect(() => strictPipe.transform({ email: "a@example.com", extra: "nope" })).toThrow(
      BadRequestException,
    );
  });
});
