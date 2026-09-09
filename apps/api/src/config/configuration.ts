import { validateEnv, type Env } from "@ame-de-fil/config";

// Passed to @nestjs/config's `validate` option — fails fast on bootstrap if
// the environment is invalid, rather than failing later on first use.
export function validate(config: Record<string, unknown>): Env {
  return validateEnv(config);
}
