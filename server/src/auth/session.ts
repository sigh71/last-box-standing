import { randomBytes, createHash } from "node:crypto";
import type { Context } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { sessions, users, type Session, type User } from "../db/schema.js";
import { isProd } from "../env.js";

const DAY = 1000 * 60 * 60 * 24;
const SESSION_TTL = 30 * DAY;
const RENEW_WINDOW = 15 * DAY;

export const SESSION_COOKIE = "session";

/** Opaque token handed to the client; only its hash is stored server-side. */
export function generateSessionToken(): string {
  return randomBytes(24).toString("base64url");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createSession(token: string, userId: number): Session {
  const session: Session = {
    id: hashToken(token),
    userId,
    expiresAt: new Date(Date.now() + SESSION_TTL),
  };
  db.insert(sessions).values(session).run();
  return session;
}

export function validateSessionToken(
  token: string,
): { session: Session; user: User } | null {
  const id = hashToken(token);
  const row = db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, id))
    .get();

  if (!row) return null;
  const { session, user } = row;

  if (Date.now() >= session.expiresAt.getTime()) {
    db.delete(sessions).where(eq(sessions.id, id)).run();
    return null;
  }

  // Sliding expiry: extend when inside the renewal window.
  if (Date.now() >= session.expiresAt.getTime() - RENEW_WINDOW) {
    session.expiresAt = new Date(Date.now() + SESSION_TTL);
    db.update(sessions)
      .set({ expiresAt: session.expiresAt })
      .where(eq(sessions.id, id))
      .run();
  }

  return { session, user };
}

export function invalidateSession(token: string): void {
  db.delete(sessions).where(eq(sessions.id, hashToken(token))).run();
}

export function setSessionCookie(c: Context, token: string, expiresAt: Date): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "Lax",
    path: "/",
    expires: expiresAt,
  });
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}
