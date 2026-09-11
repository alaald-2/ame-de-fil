import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.ts";
import { PromotionsController } from "./promotions.controller.ts";
import { PromotionsService } from "./promotions.service.ts";

// Product Promotions/Sales (percentage-off a specific variant, no code
// required) — a deliberately separate domain from DiscountsModule's
// Coupon/Discount system (still an empty stub; order-level, code-based).
// See effective-price.ts's own top comment and schema.prisma's Promotion/
// PromotionVariant models for the full separation rationale. PrismaService
// comes from the global PrismaModule; AuditService from AuditModule
// (mirrors every other admin-mutation module's own wiring).
@Module({
  imports: [AuditModule],
  controllers: [PromotionsController],
  providers: [PromotionsService],
})
export class PromotionsModule {}
