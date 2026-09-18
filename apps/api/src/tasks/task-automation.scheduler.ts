import { Injectable, Logger, type OnModuleInit, type OnModuleDestroy } from "@nestjs/common";
import { SchedulerRegistry } from "@nestjs/schedule";
import { ConfigService } from "@nestjs/config";
import type { Env } from "@ame-de-fil/config";
import { TaskAutomationService } from "./task-automation.service.ts";

const INTERVAL_NAME = "task-automation-sweep";

// Same shape as CheckoutModule's ReservationExpiryScheduler — an
// @nestjs/schedule interval registered dynamically via SchedulerRegistry
// (not a static @Interval() decorator) because the period is a
// configurable env var (TASK_AUTOMATION_SWEEP_INTERVAL_MS). Safe under
// horizontal scaling for the same reason that scheduler is: every
// generation step here is a `createMany({ skipDuplicates: true })` keyed
// on a unique dedupeKey, and every close step is a guarded `updateMany`, so
// redundant concurrent sweeps from multiple instances waste a query each,
// never double-create or double-close a task.
@Injectable()
export class TaskAutomationScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TaskAutomationScheduler.name);

  constructor(
    private readonly automation: TaskAutomationService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onModuleInit(): void {
    const intervalMs = this.config.get("TASK_AUTOMATION_SWEEP_INTERVAL_MS", { infer: true });
    const interval = setInterval(() => {
      void this.sweep();
    }, intervalMs);
    this.schedulerRegistry.addInterval(INTERVAL_NAME, interval);
  }

  onModuleDestroy(): void {
    if (this.schedulerRegistry.doesExist("interval", INTERVAL_NAME)) {
      this.schedulerRegistry.deleteInterval(INTERVAL_NAME);
    }
  }

  private async sweep(): Promise<void> {
    try {
      const result = await this.automation.runSweep();
      if (result.created > 0 || result.closed > 0) {
        this.logger.log(
          `Task automation sweep created ${result.created} task(s), closed ${result.closed} task(s)`,
        );
      }
    } catch (error) {
      // Never let one failed tick kill the interval — every step is
      // idempotent and safe to retry on the next tick regardless of why
      // this one failed (e.g. a transient DB connection blip).
      this.logger.error(
        "Task automation sweep failed",
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
