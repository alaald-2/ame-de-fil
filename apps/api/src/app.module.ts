import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { ScheduleModule } from "@nestjs/schedule";
import { LoggerModule } from "nestjs-pino";
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { validate } from "./config/configuration.js";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter.js";
import { SessionAuthGuard } from "./common/guards/session-auth.guard.js";
import { PermissionsGuard } from "./common/guards/permissions.guard.js";
import { CsrfGuard } from "./common/csrf/csrf.guard.js";
import { RateLimitGuard } from "./common/rate-limit/rate-limit.guard.js";
import { RATE_LIMIT_STORE } from "./common/rate-limit/rate-limit-store.js";
import { InMemoryRateLimitStore } from "./common/rate-limit/in-memory-rate-limit.store.js";
import { PrismaModule } from "./database/prisma.module.js";
import { IdentityModule } from "./identity/identity.module.js";
import { HealthModule } from "./health/health.module.js";
import { CatalogModule } from "./catalog/catalog.module.js";
import { InventoryModule } from "./inventory/inventory.module.js";
import { CartModule } from "./cart/cart.module.js";
import { CheckoutModule } from "./checkout/checkout.module.js";
import { OrdersModule } from "./orders/orders.module.js";
import { PaymentsModule } from "./payments/payments.module.js";
import { ShippingModule } from "./shipping/shipping.module.js";
import { DiscountsModule } from "./discounts/discounts.module.js";
import { ReviewsModule } from "./reviews/reviews.module.js";
import { CustomersModule } from "./customers/customers.module.js";
import { AdminModule } from "./admin/admin.module.js";
import { NotificationsModule } from "./notifications/notifications.module.js";
import { AuditModule } from "./audit/audit.module.js";

const CORRELATION_ID_HEADER = "x-correlation-id";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate }),
    // Registered once, globally — required for SchedulerRegistry to be
    // injectable anywhere (CheckoutModule's ReservationExpiryScheduler is
    // the only current consumer).
    ScheduleModule.forRoot(),
    LoggerModule.forRoot({
      pinoHttp: {
        genReqId: (req: IncomingMessage, res: ServerResponse) => {
          const existing = req.headers[CORRELATION_ID_HEADER];
          const id = typeof existing === "string" && existing.length > 0 ? existing : randomUUID();
          res.setHeader(CORRELATION_ID_HEADER, id);
          return id;
        },
        autoLogging: true,
        // LOG_LEVEL is validated by config/configuration.ts before this runs;
        // process.env is read directly here since Nest's ConfigService isn't
        // constructed yet at this point in module registration.
        level: process.env["LOG_LEVEL"] ?? "info",
        // The session/CSRF cookies travel in the `cookie` request header on
        // every authenticated request, a fresh session token rides out in
        // `set-cookie` on every login response, and the CSRF double-submit
        // value travels as its own `x-csrf-token` request header on every
        // state-changing one (DECISIONS.md ADR-032) — pino-http's default
        // request/response serializers log headers verbatim, so without
        // this, a session token is one log line away from being as good as
        // a stolen cookie (SECURITY.md §1/§7: no credentials or session
        // tokens in logs). Live-verified: a real logout request's
        // `x-csrf-token` header showed up unredacted here on the first
        // pass, before this line was added — caught by actually grepping a
        // live log, not by inspection alone.
        redact: {
          paths: [
            "req.headers.cookie",
            "req.headers.authorization",
            "req.headers[\"x-csrf-token\"]",
            'res.headers["set-cookie"]',
          ],
          remove: true,
        },
      },
    }),
    PrismaModule,
    IdentityModule,
    HealthModule,
    CatalogModule,
    InventoryModule,
    CartModule,
    CheckoutModule,
    OrdersModule,
    PaymentsModule,
    ShippingModule,
    DiscountsModule,
    ReviewsModule,
    CustomersModule,
    AdminModule,
    NotificationsModule,
    AuditModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Order matters: authenticate, then authorize, then check CSRF (which
    // needs request.auth from the first guard) — see each guard's own notes.
    { provide: APP_GUARD, useClass: SessionAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: RATE_LIMIT_STORE, useClass: InMemoryRateLimitStore },
  ],
})
export class AppModule {}
