import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module.ts";
import { AuditModule } from "../audit/audit.module.ts";
import { AdminUsersController } from "./admin-users.controller.ts";
import { AdminRolesController } from "./admin-roles.controller.ts";
import { AdminUsersService } from "./admin-users.service.ts";

// Admin RBAC/user administration (PRODUCT_SPEC.md §5's "Administration"
// section, ROADMAP.md Phase 5) — deliberately its own module, not folded
// into IdentityModule (which owns authentication itself: login/session/
// password building blocks, unrelated to admin-managing *other* accounts)
// or the placeholder AdminModule (never used by any real feature so far —
// every other Phase 5 slice has its own top-level module, e.g.
// CustomersModule/OrdersModule, and this follows that same convention).
// IdentityModule is imported only for its exported SessionService/
// PasswordService; AuditModule only for AuditService.
@Module({
  imports: [IdentityModule, AuditModule],
  controllers: [AdminUsersController, AdminRolesController],
  providers: [AdminUsersService],
})
export class UsersModule {}
