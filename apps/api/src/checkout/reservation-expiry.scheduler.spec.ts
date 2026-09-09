import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ConfigService } from "@nestjs/config";
import { SchedulerRegistry } from "@nestjs/schedule";
import { ReservationExpiryScheduler } from "./reservation-expiry.scheduler.ts";
import type { ReservationExpiryService } from "./reservation-expiry.service.ts";
import type { Env } from "@ame-de-fil/config";

function makeReservationExpiryService(overrides: Record<string, unknown> = {}) {
  return {
    releaseExpiredReservations: vi
      .fn()
      .mockResolvedValue({ releasedReservations: 0, canceledOrders: 0 }),
    ...overrides,
  } as unknown as ReservationExpiryService;
}

function makeSchedulerRegistry() {
  return {
    addInterval: vi.fn(),
    deleteInterval: vi.fn(),
    doesExist: vi.fn().mockReturnValue(true),
  } as unknown as SchedulerRegistry;
}

function makeConfig(intervalMs = 60_000): ConfigService<Env, true> {
  return { get: () => intervalMs } as unknown as ConfigService<Env, true>;
}

describe("ReservationExpiryScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("registers a real interval with SchedulerRegistry, using the configured interval", () => {
    const registry = makeSchedulerRegistry();
    const scheduler = new ReservationExpiryScheduler(
      makeReservationExpiryService(),
      registry,
      makeConfig(30_000),
    );

    scheduler.onModuleInit();

    expect(registry.addInterval).toHaveBeenCalledTimes(1);
    const [name, intervalId] = (registry.addInterval as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(name).toBe("reservation-expiry-sweep");
    expect(intervalId).toBeDefined();
  });

  it("calls releaseExpiredReservations on each tick, at the configured interval", async () => {
    const reservationExpiry = makeReservationExpiryService();
    const scheduler = new ReservationExpiryScheduler(
      reservationExpiry,
      makeSchedulerRegistry(),
      makeConfig(30_000),
    );

    scheduler.onModuleInit();
    expect(reservationExpiry.releaseExpiredReservations).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(30_000);
    expect(reservationExpiry.releaseExpiredReservations).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(reservationExpiry.releaseExpiredReservations).toHaveBeenCalledTimes(2);
  });

  it("does not throw, and keeps ticking, when a sweep fails", async () => {
    const reservationExpiry = makeReservationExpiryService({
      releaseExpiredReservations: vi
        .fn()
        .mockRejectedValueOnce(new Error("transient DB error"))
        .mockResolvedValueOnce({ releasedReservations: 1, canceledOrders: 1 }),
    });
    const scheduler = new ReservationExpiryScheduler(
      reservationExpiry,
      makeSchedulerRegistry(),
      makeConfig(1_000),
    );

    scheduler.onModuleInit();

    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(reservationExpiry.releaseExpiredReservations).toHaveBeenCalledTimes(2);
  });

  it("removes the registered interval on module destroy", () => {
    const registry = makeSchedulerRegistry();
    const scheduler = new ReservationExpiryScheduler(
      makeReservationExpiryService(),
      registry,
      makeConfig(),
    );

    scheduler.onModuleInit();
    scheduler.onModuleDestroy();

    expect(registry.deleteInterval).toHaveBeenCalledWith("reservation-expiry-sweep");
  });

  it("does not attempt to delete an interval that was never registered", () => {
    const registry = makeSchedulerRegistry();
    (registry.doesExist as ReturnType<typeof vi.fn>).mockReturnValue(false);
    const scheduler = new ReservationExpiryScheduler(
      makeReservationExpiryService(),
      registry,
      makeConfig(),
    );

    scheduler.onModuleDestroy();

    expect(registry.deleteInterval).not.toHaveBeenCalled();
  });
});
