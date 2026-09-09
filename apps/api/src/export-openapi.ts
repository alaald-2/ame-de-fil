import { writeFile } from "node:fs/promises";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module.ts";
import { API_PREFIX, API_PREFIX_EXCLUDE } from "./bootstrap-config.ts";

// Writes the OpenAPI document to disk without binding a port — feeds
// packages/types' codegen (openapi-typescript). Doesn't need a live
// database: Nest's module graph builds without PrismaService connecting
// (it connects lazily — see database/prisma.service.ts).
async function main(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });

  app.setGlobalPrefix(API_PREFIX, { exclude: API_PREFIX_EXCLUDE });

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle("Âme de Fil API")
      .setDescription("Internal REST API — apps/storefront and apps/admin are its only clients.")
      .setVersion("1")
      .addCookieAuth("ame_session")
      .build(),
  );

  await writeFile(new URL("../openapi.json", import.meta.url), JSON.stringify(document, null, 2));
  await app.close();
}

await main();
