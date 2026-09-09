import { Injectable, Logger, type OnModuleInit, type OnModuleDestroy } from "@nestjs/common";
import { SchedulerRegistry } from "@nestjs/schedule";
import { ConfigService } from "@nestjs/config";
import type { Env } from "@ame-de-fil/config";
import { ReservationExpiryService } from "./reservation-expiry.service.ts";

const INTERVAL_NAME = "reservation-expiry-sweep";

// The concrete, automatic trigger for ReservationExpiryService's own
// idempotent release logic — closing the gap that service's header comment
// used to describe ("nothing in this environment schedules it
// automatically"). Registered dynamically via SchedulerRegistry rather than
// a static @Interval() decorator because the sweep interval is a
// configurable env var (RESERVATION_EXPIRY_SWEEP_INTERVAL_MS, consistent
// with every other TTL in this project) — a decorator argument is a
// compile-time constant and can't read ConfigService.
//
// @nestjs/schedule's in-process interval, not BullMQ (DECISIONS.md
// ADR-013's original plan): BullMQ needs Valkey, which — like Postgres in
// this dev environment — isn't provisioned here either, and the release
// logic doesn't need BullMQ's retry/backoff/dead-letter machinery, just a
// periodic idempotent call. Safe under horizontal scaling too: each
// instance runs its own independent sweep, but ReservationExpiryService's
// guarded PENDING -> EXPIRED updates mean a reservation is only ever
// released once regardless of how many instances race to claim it —
// redundant sweeps waste a query, never double-release stock.
@Injectable()
export class ReservationExpiryScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReservationExpiryScheduler.name);

  constructor(
    private readonly reservationExpiry: ReservationExpiryService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onModuleInit(): void {
    const intervalMs = this.config.get("RESERVATION_EXPIRY_SWEEP_INTERVAL_MS", { infer: true });
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
      const result = await this.reservationExpiry.releaseExpiredReservations();
      if (result.releasedReservations > 0 || result.canceledOrders > 0) {
        this.logger.log(
          `Reservation expiry sweep released ${result.releasedReservations} reservation(s), canceled ${result.canceledOrders} order(s)`,
        );
      }
    } catch (error) {
      // Never let one failed tick kill the interval — the sweep is
      // idempotent and safe to retry on the next tick regardless of why
      // this one failed (e.g. a transient DB connection blip).
      this.logger.error(
        "Reservation expiry sweep failed",
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
