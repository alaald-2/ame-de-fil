// Pure security-boundary primitives for admin user/role administration
// (admin-users.service.ts) — kept dependency-free and separately testable,
// the same "extract the pure decision logic" posture as
// orders/refund-idempotency.ts. None of these touch the database; the
// service is responsible for gathering the inputs and acting on the result.

// The one permission that gates being able to assign/remove roles at all
// (approved design — not broadened to protect every permission's last
// holder, only this specific one).
export const ROLE_MANAGEMENT_GATE_PERMISSION = "users.manage_roles";

// An admin can only grant a role — to anyone, including themselves — if
// they already hold every permission that role would grant. This is what
// actually prevents privilege escalation via role assignment: it's checked
// independently of, and in addition to, the separate self-targeting block
// (isSelfTarget below), since it also covers "escalate a colleague beyond
// what you yourself are trusted with."
export function permissionsAreSubsetOfActor(
  rolePermissionKeys: readonly string[],
  actorPermissions: readonly string[],
): boolean {
  const actorSet = new Set(actorPermissions);
  return rolePermissionKeys.every((key) => actorSet.has(key));
}

// Self-role-changes are blocked completely (approved design) — not only
// self-escalation. Simplest possible boundary: an admin never has to
// reason about whether editing their own roles increased or decreased
// their own privilege, and it can never be used to engineer a self-lockout
// either. Also used for self-deactivation.
export function isSelfTarget(actorUserId: string, targetUserId: string): boolean {
  return actorUserId === targetUserId;
}
