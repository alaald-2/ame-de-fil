import { describe, expect, it } from "vitest";
import { isSelfTarget, permissionsAreSubsetOfActor } from "./rbac-guard.ts";

describe("permissionsAreSubsetOfActor", () => {
  it("returns true when the role grants no permissions at all", () => {
    expect(permissionsAreSubsetOfActor([], ["orders.view"])).toBe(true);
  });

  it("returns true when the actor holds every permission the role grants", () => {
    expect(
      permissionsAreSubsetOfActor(
        ["orders.view", "orders.refund"],
        ["orders.view", "orders.refund", "audit.view"],
      ),
    ).toBe(true);
  });

  it("returns false when the actor is missing even one permission the role grants", () => {
    expect(permissionsAreSubsetOfActor(["orders.view", "orders.refund"], ["orders.view"])).toBe(
      false,
    );
  });

  it("returns false when the actor holds none of the role's permissions", () => {
    expect(permissionsAreSubsetOfActor(["orders.refund"], [])).toBe(false);
  });
});

describe("isSelfTarget", () => {
  it("returns true when the actor and target are the same user", () => {
    expect(isSelfTarget("user-1", "user-1")).toBe(true);
  });

  it("returns false when the actor and target differ", () => {
    expect(isSelfTarget("user-1", "user-2")).toBe(false);
  });
});
