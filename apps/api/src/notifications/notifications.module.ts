import { Module } from "@nestjs/common";

// Notification dispatch — transactional email via BullMQ jobs
// (ARCHITECTURE.md §3/§5). No controllers/services yet — email provider
// choice is deferred (DECISIONS.md ADR-020) and dispatch logic is a later phase.
@Module({})
export class NotificationsModule {}
