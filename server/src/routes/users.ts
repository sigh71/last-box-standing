import { Hono } from "hono";
import { eq, asc } from "drizzle-orm";
import { db } from "../db/index.js";
import { users, sessions } from "../db/schema.js";
import { isAdminEmail } from "../env.js";
import { requireAuth, requireAdmin, type AuthVariables } from "../auth/middleware.js";

/**
 * User management is admin-only, but *reading* the roster is not: any member
 * can say who owns a copy, who's holding it, and who's coming to a weekend,
 * and those pickers need names to offer. Admins themselves come from
 * ADMIN_EMAILS.
 */
const router = new Hono<{ Variables: AuthVariables }>();
router.use("*", requireAuth);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.get("/", (c) => {
  const rows = db.select().from(users).orderBy(asc(users.email)).all();
  return c.json({
    users: rows.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      avatarUrl: u.avatarUrl,
      isAdmin: isAdminEmail(u.email),
      // Null googleId = added by an admin but hasn't signed in yet.
      signedIn: u.googleId !== null,
      deactivatedAt: u.deactivatedAt,
      addedBy: u.addedBy,
    })),
  });
});

router.post("/", requireAdmin, async (c) => {
  const body = await c.req.json<{ email?: string; name?: string }>();
  const email = body.email?.trim().toLowerCase() ?? "";
  if (!EMAIL_RE.test(email)) return c.json({ error: "A valid email is required" }, 400);

  const name = body.name?.trim() || null;
  const existing = db.select().from(users).where(eq(users.email, email)).get();

  if (existing) {
    if (existing.deactivatedAt === null) {
      return c.json({ error: "That person already has access" }, 409);
    }
    // Re-adding someone previously removed restores them (and their history).
    db.update(users)
      .set({ deactivatedAt: null, ...(name ? { name } : {}) })
      .where(eq(users.id, existing.id))
      .run();
    return c.json({ user: { id: existing.id, email }, restored: true });
  }

  const created = db
    .insert(users)
    .values({ email, name, addedBy: c.get("user")!.id })
    .returning()
    .get();
  return c.json({ user: { id: created.id, email }, restored: false }, 201);
});

router.delete("/:id", requireAdmin, (c) => {
  const id = Number(c.req.param("id"));
  const me = c.get("user")!;
  if (id === me.id) return c.json({ error: "You can't remove yourself" }, 400);

  const target = db.select().from(users).where(eq(users.id, id)).get();
  if (!target) return c.json({ error: "Not found" }, 404);
  if (isAdminEmail(target.email)) {
    return c.json(
      { error: "Admins can't be removed here — take them out of ADMIN_EMAILS and restart." },
      400,
    );
  }

  db.update(users).set({ deactivatedAt: new Date() }).where(eq(users.id, id)).run();
  // Drop their sessions so access ends now, not when the cookie expires.
  db.delete(sessions).where(eq(sessions.userId, id)).run();
  return c.json({ ok: true });
});

export default router;
