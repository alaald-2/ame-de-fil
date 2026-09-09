import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";

export interface HealthResult {
  status: "ok" | "degraded";
  checks: { database: "up" | "down" };
  timestamp: string;
}

const DB_CHECK_TIMEOUT_MS = 2000;

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<HealthResult> {
    const database = await this.checkDatabase();
    return {
      status: database === "up" ? "ok" : "degraded",
      checks: { database },
      timestamp: new Date().toISOString(),
    };
  }

  private async checkDatabase(): Promise<"up" | "down"> {
    try {
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise((_resolve, reject) =>
          setTimeout(() => reject(new Error("database check timed out")), DB_CHECK_TIMEOUT_MS),
        ),
      ]);
      return "up";
    } catch {
      return "down";
    }
  }
}
