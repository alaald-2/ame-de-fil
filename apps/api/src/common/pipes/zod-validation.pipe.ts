import { BadRequestException, type PipeTransform } from "@nestjs/common";
import type { ZodType } from "zod";

// Deliberately not the `nestjs-zod` package: its @nestjs/common peer range
// (^10/^11) doesn't cover Nest 12 yet (verified against npm at Phase 1 build
// time). This is the same ~20-line pattern that library wraps, without the
// version-lag risk. packages/validation stays the single source of truth for
// schemas (ARCHITECTURE.md §2); this pipe just applies one per route:
// `@UsePipes(new ZodValidationPipe(mySchema))`.
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        error: "ValidationError",
        message: result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
      });
    }
    return result.data;
  }
}
