import { Injectable } from "@nestjs/common";
import * as argon2 from "argon2";

// Argon2id — memory-hard, current OWASP recommendation (SECURITY.md §1);
// never bcrypt/plain SHA.
@Injectable()
export class PasswordService {
  async hash(plainPassword: string): Promise<string> {
    return argon2.hash(plainPassword, { type: argon2.argon2id });
  }

  async verify(hash: string, plainPassword: string): Promise<boolean> {
    return argon2.verify(hash, plainPassword);
  }
}
