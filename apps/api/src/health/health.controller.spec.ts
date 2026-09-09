import { describe, expect, it, afterEach } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import supertest from "supertest";
import { HealthController } from "./health.controller.js";
import { HealthService } from "./health.service.js";
import { PrismaService } from "../database/prisma.service.js";
import { AllExceptionsFilter } from "../common/filters/all-exceptions.filter.js";

// Boots a real (in-process, no network/Docker) Nest application with a
// mocked PrismaService, so both the healthy and degraded paths are
// genuinely exercised end-to-end through HTTP, not just unit-called.
async function bootApp(queryRaw: () => Promise<unknown>): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [HealthService, { provide: PrismaService, useValue: { $queryRaw: queryRaw } }],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  return app;
}

describe("HealthController (e2e, mocked Prisma)", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("returns 200 and status ok when the database check succeeds", async () => {
    app = await bootApp(() => Promise.resolve([{ "?column?": 1 }]));

    const response = await supertest(app.getHttpServer()).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: "ok", checks: { database: "up" } });
  });

  it("returns 503 and status degraded when the database check fails", async () => {
    app = await bootApp(() => Promise.reject(new Error("connection refused")));

    const response = await supertest(app.getHttpServer()).get("/health");

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ status: "degraded", checks: { database: "down" } });
  });
});
