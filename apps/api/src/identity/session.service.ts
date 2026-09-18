import { randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "@ame-de-fil/config";
import { Prisma, UserStatus } from "@ame-de-fil/database";
import { PrismaService } from "../database/prisma.service.ts";
import type { AuthContext } from "../common/types/auth-context.ts";

const TOKEN_BYTES = 32;

export interface CreateSessionInput {
  userId: string;
  userAgent?: string;
  ipAddress?: string;
}

export interface CreatedSession {
  token: string;
  csrfToken: string;
  expiresAt: Date;
}

// Session creation/lookup/invalidation structure only — no login/password-
// reset HTTP endpoints yet (those are a real product surface, out of scope
// for this checkpoint). ADR-015: opaque, cryptographically random tokens.
@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async createSession(input: CreateSessionInput): Promise<CreatedSession> {
    const token = randomBytes(TOKEN_BYTES).toString("base64url");
    const csrfToken = randomBytes(TOKEN_BYTES).toString("base64url");
    const ttlHours = this.config.get("SESSION_TTL_HOURS", { infer: true });
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    await this.prisma.session.create({
      data: {
        id: token,
        csrfToken,
        userId: input.userId,
        userAgent: input.userAgent,
        ipAddress: input.ipAddress,
        expiresAt,
      },
    });

    return { token, csrfToken, expiresAt };
  }

  // Object-level authorization elsewhere depends on this returning null for
  // anything not currently valid — never partially-valid (SECURITY.md §2).
  async validateSession(token: string): Promise<AuthContext | null> {
    if (!token) return null;

    const session = await this.prisma.session.findUnique({
      where: { id: token },
      include: {
        user: {
          include: {
            roles: {
              include: { role: { include: { permissions: { include: { permission: true } } } } },
            },
          },
        },
      },
    });

    if (!session) return null;
    if (session.revokedAt) return null;
    if (session.expiresAt.getTime() <= Date.now()) return null;
    // A user disabled after this session was issued must lose access
    // immediately, not just at their next login (SECURITY.md §1: "an admin
    // must be able to kill a session instantly") — checked here, not only
    // in AuthService.login, since an already-issued session never goes
    // through login again.
    if (session.user.status !== UserStatus.ACTIVE) return null;

    const permissions = new Set<string>();
    for (const userRole of session.user.roles) {
      for (const rolePermission of userRole.role.permissions) {
        permissions.add(rolePermission.permission.key);
      }
    }

    return {
      userId: session.userId,
      sessionId: session.id,
      csrfToken: session.csrfToken,
      permissions: Array.from(permissions),
      emailVerifiedAt: session.user.emailVerifiedAt,
    };
  }

  async revokeSession(token: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: token, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // Deactivation's own logout-everywhere step (users/admin-users.service.ts)
  // — deliberately not relied upon as the *only* enforcement, since
  // validateSession above already rejects a DISABLED user's session
  // regardless of revokedAt; this makes that intent explicit and durable
  // (a re-activated account doesn't inherit a still-unexpired old session).
  // Takes an optional open transaction client (AuditService.record's same
  // idiom) so a caller can commit this atomically with the status change
  // it's revoking sessions for.
  async revokeAllSessionsForUser(
    userId: string,
    client: PrismaService | Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    await client.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
