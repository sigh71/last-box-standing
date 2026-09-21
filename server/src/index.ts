import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { env, isProd, isAdminEmail } from "./env.js";
import { runMigrations } from "./db/migrate.js";
import { watcherCount } from "./services/live.js";
import { authMiddleware, type AuthVariables } from "./auth/middleware.js";
import authRoutes from "./routes/auth.js";
import eventRoutes from "./routes/events.js";
import userRoutes from "./routes/users.js";
import gameRoutes from "./routes/games.js";
import copyRoutes from "./routes/copies.js";
import bggRoutes from "./routes/bgg.js";
import playRoutes from "./routes/plays.js";
import pickingRoutes from "./routes/picking.js";

// Ensure the schema is current before serving any request.
runMigrations();

const app = new Hono<{ Variables: AuthVariables }>();

// ---- API ----
const api = new Hono<{ Variables: AuthVariables }>();

// `watchers` is the number of open live-update streams — the quickest way to
// tell a proxy that's swallowing SSE from a client that never connected.
api.get("/health", (c) => c.json({ status: "ok", watchers: watcherCount() }));

api.use("*", authMiddleware);
api.route("/auth", authRoutes);
api.route("/events", eventRoutes);
api.route("/users", userRoutes);
api.route("/games", gameRoutes);
api.route("/copies", copyRoutes);
api.route("/bgg", bggRoutes);
api.route("/", playRoutes); // /slots/:id/plays, /plays/:id
api.route("/", pickingRoutes); // /slots/:id/nominations|start|veto|advance|reopen

api.get("/me", (c) => {
  const user = c.get("user");
  if (!user) return c.json({ user: null });
  return c.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      isAdmin: isAdminEmail(user.email),
    },
  });
});

app.route("/api", api);

// ---- Static SPA (production only) ----
// In dev the Vite server serves the client and proxies /api here.
if (isProd) {
  const clientDist = fileURLToPath(new URL("../../client/dist", import.meta.url));
  const indexHtmlPath = join(clientDist, "index.html");

  if (!existsSync(indexHtmlPath)) {
    console.warn(`[warn] Client build not found at ${clientDist}. Did you run the client build?`);
  }
  const indexHtml = existsSync(indexHtmlPath)
    ? readFileSync(indexHtmlPath, "utf-8")
    : "<h1>Client build missing</h1>";

  const MIME: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".map": "application/json; charset=utf-8",
  };

  // Serve built files; fall back to index.html for client-side routes.
  app.get("/*", (c) => {
    const pathname = decodeURIComponent(new URL(c.req.url).pathname);
    const rel = normalize(pathname).replace(/^(\.\.[/\\])+/, "").replace(/^[/\\]+/, "");
    const filePath = join(clientDist, rel);

    if (filePath.startsWith(clientDist) && rel !== "") {
      try {
        if (statSync(filePath).isFile()) {
          const type = MIME[extname(filePath).toLowerCase()] ?? "application/octet-stream";
          c.header("Content-Type", type);
          // Vite emits content-hashed asset filenames -> safe to cache aggressively.
          if (rel.startsWith("assets/")) {
            c.header("Cache-Control", "public, max-age=31536000, immutable");
          }
          const buf = readFileSync(filePath);
          return c.body(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
        }
      } catch {
        // fall through to SPA index
      }
    }
    return c.html(indexHtml);
  });
}

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`Server listening on http://localhost:${info.port} (${env.NODE_ENV})`);
});
