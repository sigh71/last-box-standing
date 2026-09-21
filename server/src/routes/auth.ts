import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { eq } from "drizzle-orm";
import {
  google,
  generateState,
  generateCodeVerifier,
  fetchGoogleUser,
} from "../auth/google.js";
import { isAdminEmail, isProd } from "../env.js";
import { db } from "../db/index.js";
import { users, type User } from "../db/schema.js";
import {
  generateSessionToken,
  createSession,
  invalidateSession,
  setSessionCookie,
  clearSessionCookie,
  SESSION_COOKIE,
} from "../auth/session.js";
import type { AuthVariables } from "../auth/middleware.js";

const STATE_COOKIE = "google_oauth_state";
const VERIFIER_COOKIE = "google_code_verifier";

const auth = new Hono<{ Variables: AuthVariables }>();

// Step 1: kick off the OAuth flow.
auth.get("/google", (c) => {
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const url = google.createAuthorizationURL(state, codeVerifier, [
    "openid",
    "profile",
    "email",
  ]);

  const opts = {
    httpOnly: true,
    secure: isProd,
    sameSite: "Lax" as const,
    path: "/",
    maxAge: 60 * 10,
  };
  setCookie(c, STATE_COOKIE, state, opts);
  setCookie(c, VERIFIER_COOKIE, codeVerifier, opts);

  return c.redirect(url.toString());
});

// Step 2: Google redirects back here with a code.
auth.get("/google/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const storedState = getCookie(c, STATE_COOKIE);
  const codeVerifier = getCookie(c, VERIFIER_COOKIE);

  deleteCookie(c, STATE_COOKIE, { path: "/" });
  deleteCookie(c, VERIFIER_COOKIE, { path: "/" });

  if (!code || !state || !storedState || !codeVerifier || state !== storedState) {
    return c.redirect("/login?error=invalid_request");
  }

  let profile;
  try {
    const tokens = await google.validateAuthorizationCode(code, codeVerifier);
    profile = await fetchGoogleUser(tokens.accessToken());
  } catch {
    return c.redirect("/login?error=oauth_failed");
  }

  if (!profile.email || !profile.email_verified) {
    return c.redirect("/login?error=not_allowed");
  }

  const email = profile.email.toLowerCase();
  const isAdmin = isAdminEmail(email);

  // Match on the Google id first, then fall back to the email so this login can
  // claim a row an admin created before this person had ever signed in.
  let user: User | undefined =
    db.select().from(users).where(eq(users.googleId, profile.sub)).get() ??
    db.select().from(users).where(eq(users.email, email)).get();

  // Admins are always let in; everyone else needs an active row an admin added.
  if (!isAdmin && (!user || user.deactivatedAt !== null)) {
    return c.redirect("/login?error=not_allowed");
  }

  const profileFields = {
    googleId: profile.sub,
    email,
    name: profile.name ?? user?.name ?? null,
    avatarUrl: profile.picture ?? null,
  };

  if (user) {
    db.update(users)
      // An admin whose row was deactivated is restored on login — the env list wins.
      .set({ ...profileFields, ...(isAdmin ? { deactivatedAt: null } : {}) })
      .where(eq(users.id, user.id))
      .run();
    user = db.select().from(users).where(eq(users.id, user.id)).get()!;
  } else {
    user = db.insert(users).values(profileFields).returning().get();
  }

  const token = generateSessionToken();
  const session = createSession(token, user.id);
  setSessionCookie(c, token, session.expiresAt);

  return c.redirect("/");
});

// Dev-only: sign in as any existing user (e.g. the seeded fakes) without
// Google. Route is not registered at all in production builds.
if (!isProd) {
  auth.get("/dev-login/:userId", (c) => {
    const userId = Number(c.req.param("userId"));
    const user = db.select().from(users).where(eq(users.id, userId)).get();
    if (!user) return c.json({ error: "No such user" }, 404);
    const token = generateSessionToken();
    const session = createSession(token, user.id);
    setSessionCookie(c, token, session.expiresAt);
    return c.redirect("/");
  });
}

auth.post("/logout", (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) invalidateSession(token);
  clearSessionCookie(c);
  return c.json({ ok: true });
});

export default auth;
