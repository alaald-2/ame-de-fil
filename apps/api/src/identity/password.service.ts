import { Injectable } from "@nestjs/common";
import * as argon2 from "argon2";

// Pinned explicitly rather than left to the `argon2` package's own library
// defaults (which these values currently match) — a future major-version
// bump to that package could otherwise silently weaken every new hash
// without this file changing at all. Values are today's OWASP-recommended
// minimums for argon2id.
const ARGON2ID_MEMORY_COST_KIB = 65536; // 64 MiB
const ARGON2ID_TIME_COST = 3;
const ARGON2ID_PARALLELISM = 4;

// Argon2id — memory-hard, current OWASP recommendation (SECURITY.md §1);
// never bcrypt/plain SHA.
@Injectable()
export class PasswordService {
  async hash(plainPassword: string): Promise<string> {
    return argon2.hash(plainPassword, {
      type: argon2.argon2id,
      memoryCost: ARGON2ID_MEMORY_COST_KIB,
      timeCost: ARGON2ID_TIME_COST,
      parallelism: ARGON2ID_PARALLELISM,
    });
  }

  // Unaffected by the explicit params above — argon2's own encoded hash
  // string already embeds the parameters it was created with, so verify()
  // always re-derives using whatever a given hash was actually hashed with.
  async verify(hash: string, plainPassword: string): Promise<boolean> {
    return argon2.verify(hash, plainPassword);
  }
}
