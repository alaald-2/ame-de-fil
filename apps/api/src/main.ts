import "reflect-metadata";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { Logger } from "nestjs-pino";
import type { Env } from "@ame-de-fil/config";
import { AppModule } from "./app.module.js";
import { API_PREFIX, API_PREFIX_EXCLUDE } from "./bootstrap-config.js";

async function bootstrap(): Promise<void> {
  // rawBody: true — Nest still parses req.body as JSON for every route as
  // usual, but additionally captures the exact raw bytes onto
  // req.rawBody. The Stripe webhook controller needs that untouched
  // buffer (never the re-serialized JSON object) for
  // stripe.webhooks.constructEvent's signature check (SECURITY.md §6).
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });
  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService<Env, true>);

  // CSP for apps/api itself stays unset — it serves JSON/Swagger, never
  // renders Stripe.js/Payment Element (that runs in apps/storefront's
  // browser context; see apps/storefront/next.config.ts). Not the same gap
  // this comment used to flag.
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cookieParser());

  app.enableCors({
    origin: config.get("CORS_ALLOWED_ORIGINS", { infer: true }),
    credentials: true,
  });

  // Health stays unversioned/unprefixed (DEPLOYMENT.md §5) for load-balancer
  // probes; everything else sits under /api/v1 (the brief's requirement).
  // Shared with export-openapi.ts via bootstrap-config.ts so the generated
  // OpenAPI document's paths can never drift from the real runtime routes.
  app.setGlobalPrefix(API_PREFIX, { exclude: API_PREFIX_EXCLUDE });

  const swaggerDocument = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle("Âme de Fil API")
      .setDescription("Internal REST API — apps/storefront and apps/admin are its only clients.")
      .setVersion("1")
      .addCookieAuth("ame_session")
      .build(),
  );
  SwaggerModule.setup("api/docs", app, swaggerDocument);

  const port = config.get("PORT", { infer: true });
  await app.listen(port);
}

await bootstrap();
