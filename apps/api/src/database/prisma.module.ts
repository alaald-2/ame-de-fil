import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service.ts";

// Global so every domain module can inject PrismaService without each one
// re-importing this module (ARCHITECTURE.md §2 — apps/api is the only
// consumer of packages/database).
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
