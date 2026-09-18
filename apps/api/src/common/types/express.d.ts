// pino-http sets req.id at runtime (configured as the correlation ID in
// app.module.ts's LoggerModule setup); SessionAuthGuard sets req.auth. Neither
// augmentation ships with those packages.
import "express";
import type { AuthContext } from "./auth-context.ts";

declare module "express" {
  interface Request {
    id?: string;
    auth?: AuthContext;
  }
}
