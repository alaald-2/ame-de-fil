import { Module } from "@nestjs/common";

// Append-only AuditLog writes (SECURITY.md §9). No controllers/services
// yet — the write path is added alongside the first admin mutation that
// needs it, so it's exercised by a real caller rather than built speculatively.
@Module({})
export class AuditModule {}
