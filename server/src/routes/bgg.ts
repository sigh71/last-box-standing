import { Hono } from "hono";
import { requireAuth, type AuthVariables } from "../auth/middleware.js";
import { searchBgg, bggErrorResponse } from "../services/bgg.js";

/**
 * Search proxy for BoardGameGeek — avoids browser CORS and keeps results in the
 * database cache. There is deliberately no "fetch one game" route: details are
 * pulled server-side exactly once, when a game is first added to the library
 * (see services/games.ts).
 */
const router = new Hono<{ Variables: AuthVariables }>();
router.use("*", requireAuth);

router.get("/search", async (c) => {
  const q = c.req.query("q")?.trim();
  if (!q) return c.json({ error: "q required" }, 400);
  try {
    return c.json({ results: await searchBgg(q) });
  } catch (err) {
    console.error("BGG search failed:", err);
    const { status, body } = bggErrorResponse(err);
    return c.json(body, status);
  }
});

export default router;
