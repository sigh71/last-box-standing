import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import type { User, Session } from "../db/schema.js";
import { isAdminEmail } from "../env.js";
import {
  SESSION_COOKIE,
  validateSessionToken,
  invalidateSession,
  setSessionCookie,
  clearSessionCookie,
} from "./session.js";

export type AuthVariables = {
  user: User | null;
  session: Session | null;
};

/** Resolves the current session from the cookie and attaches user/session to context. */
export const authMiddleware = createMiddleware<{ Variables: AuthVariables }>(
  async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (!token) {
      c.set("user", null);
      c.set("session", null);
      return next();
    }

    const result = validateSessionToken(token);
    if (result && result.user.deactivatedAt !== null) {
      // Removed by an admin: drop the session so access ends immediately
      // instead of lingering until the cookie expires.
      invalidateSession(token);
      c.set("user", null);
      c.set("session", null);
      clearSessionCookie(c);
    } else if (result) {
      c.set("user", result.user);
      c.set("session", result.session);
      // Keep the cookie in sync with the (possibly renewed) expiry.
      setSessionCookie(c, token, result.session.expiresAt);
    } else {
      c.set("user", null);
      c.set("session", null);
      clearSessionCookie(c);
    }
    return next();
  },
);

/** Rejects unauthenticated requests with 401. */
export const requireAuth = createMiddleware<{ Variables: AuthVariables }>(
  async (c, next) => {
    if (!c.get("user")) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    return next();
  },
);

/** Rejects anyone whose email isn't in ADMIN_EMAILS. */
export const requireAdmin = createMiddleware<{ Variables: AuthVariables }>(
  async (c, next) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    if (!isAdminEmail(user.email)) {
      return c.json({ error: "Admins only" }, 403);
    }
    return next();
  },
);
