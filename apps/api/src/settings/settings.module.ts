import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.ts";
import { AdminStoreSettingsController } from "./admin-store-settings.controller.ts";
import { AdminStoreSettingsService } from "./admin-store-settings.service.ts";

@Module({
  imports: [AuditModule],
  controllers: [AdminStoreSettingsController],
  providers: [AdminStoreSettingsService],
})
export class SettingsModule {}
