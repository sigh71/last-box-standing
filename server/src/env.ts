/**
 * Central runtime configuration, read once from the environment.
 * Real values come from the VM's git-ignored `.env` (see `.env.example`).
 */
export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: Number(process.env.PORT ?? 3000),
  DATABASE_PATH: process.env.DATABASE_PATH ?? "./data/app.db",
  // Public origin of the app; used to build the OAuth redirect + secure cookies.
  APP_URL: (process.env.APP_URL ?? "http://localhost:5173").replace(/\/$/, ""),
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? "",
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? "",
  // BoardGameGeek application token (their XML API requires a registered app
  // since 2025 — see https://boardgamegeek.com/using_the_xml_api).
  BGG_APP_TOKEN: process.env.BGG_APP_TOKEN ?? "",
  // Admins: always allowed in, and the only people who can manage users.
  // Falls back to the older ALLOWED_EMAILS name so an un-updated .env keeps
  // working (and can't lock everyone out) after deploying this change.
  ADMIN_EMAILS: (process.env.ADMIN_EMAILS ?? process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
} as const;

export const isProd = env.NODE_ENV === "production";

export const GOOGLE_REDIRECT_URI = `${env.APP_URL}/api/auth/google/callback`;

/** Whether an email belongs to an admin. Everyone else is managed in the DB. */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return env.ADMIN_EMAILS.includes(email.trim().toLowerCase());
}
