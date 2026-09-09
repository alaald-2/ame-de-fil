import { randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "@ame-de-fil/config";
import { PrismaService } from "../database/prisma.service.js";
import type { AuthContext } from "../common/types/auth-context.js";

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
    };
  }

  async revokeSession(token: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: token, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
