import { z } from "zod";
import { normalizeEmail } from "../normalize-email.ts";

// `.transform` runs before `.pipe(z.email())` deliberately — trimming/
// lowercasing first means a valid-but-padded or valid-but-mixed-case address
// is never wrongly rejected by the format check, and the value every DTO
// consumer sees is already the exact string User.email is looked up/stored
// by (normalize-email.ts).
export const normalizedEmailSchema = z.string().transform(normalizeEmail).pipe(z.email());
