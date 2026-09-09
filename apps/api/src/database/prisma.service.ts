import { Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@ame-de-fil/database";

// Deliberately does not $connect() eagerly on module init: Prisma 7's
// engine-less client (ADR-009) connects lazily on first query. Eager
// connection would make the whole API fail to boot whenever Postgres is
// unreachable (e.g. this Phase 1 environment, which has no Docker) — the
// health endpoint probes connectivity explicitly instead (health/health.service.ts).
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const connectionString = process.env["DATABASE_URL"];
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set");
    }
    super({ adapter: new PrismaPg({ connectionString }) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log("Prisma client disconnected");
  }
}
