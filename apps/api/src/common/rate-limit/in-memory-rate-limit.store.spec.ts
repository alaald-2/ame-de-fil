import { describe, expect, it, vi } from "vitest";
import { InMemoryRateLimitStore } from "./in-memory-rate-limit.store.js";

describe("InMemoryRateLimitStore", () => {
  it("increments count within the same window", () => {
    const store = new InMemoryRateLimitStore();
    expect(store.increment("key", 60_000).count).toBe(1);
    expect(store.increment("key", 60_000).count).toBe(2);
    expect(store.increment("key", 60_000).count).toBe(3);
  });

  it("tracks separate keys independently", () => {
    const store = new InMemoryRateLimitStore();
    store.increment("a", 60_000);
    store.increment("a", 60_000);
    expect(store.increment("b", 60_000).count).toBe(1);
  });

  it("resets the count after the window expires", () => {
    vi.useFakeTimers();
    try {
      const store = new InMemoryRateLimitStore();
      store.increment("key", 1000);
      store.increment("key", 1000);
      vi.advanceTimersByTime(1001);
      expect(store.increment("key", 1000).count).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
