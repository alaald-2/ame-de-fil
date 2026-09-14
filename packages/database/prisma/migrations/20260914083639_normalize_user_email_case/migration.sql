-- Data-only migration (no schema diff) — hand-written, the sanctioned
-- exception to "generate, never hand-write" (CONTRIBUTING.md), since Prisma
-- has no DSL for a data-only UPDATE. Ships alongside the new application-
-- level email normalization (register/login/forgot-password/Google
-- find-or-create all now trim+lowercase before matching User.email):
-- existing rows aren't guaranteed lowercase (mostly Google-created, and
-- Google's own `email` claim isn't guaranteed lowercase either), so without
-- this backfill an existing user whose stored email has any uppercase
-- character would stop matching the moment login starts normalizing the
-- *submitted* address.
--
-- Aborts instead of silently merging data if two existing rows would
-- collide once lowercased (extremely unlikely given today's data, but a
-- real possibility in principle) — such a case needs a human decision
-- (merge accounts? contact one owner?), not an automatic pick-a-winner.
DO $$
DECLARE
  dup_count int;
BEGIN
  SELECT count(*) INTO dup_count FROM (
    SELECT lower(email) FROM "User" GROUP BY lower(email) HAVING count(*) > 1
  ) d;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'normalize_user_email_case: % email(s) would collide after lowercasing — resolve manually first', dup_count;
  END IF;
END $$;

UPDATE "User" SET email = lower(email) WHERE email <> lower(email);
