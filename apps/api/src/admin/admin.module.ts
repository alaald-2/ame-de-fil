import { Module } from "@nestjs/common";

// Cross-cutting admin operations — dashboard, RBAC administration, audit
// log viewer (ARCHITECTURE.md §3, PRODUCT_SPEC.md §5). No controllers/
// services yet — complete admin features are a later phase.
@Module({})
export class AdminModule {}
