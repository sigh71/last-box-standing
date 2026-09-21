#!/usr/bin/env bash
#
# Pre-deploy backup of the live SQLite database.
#
# Runs on the VM from the repo root, before `docker compose up -d --build`.
# The database lives on the `db-data` docker volume, so it survives image
# rebuilds — but not a bad migration (they apply on server startup), and not
# `docker compose down -v`. This takes a consistent snapshot first so there is
# always a way back.
#
# The app runs SQLite in WAL mode, so `cp app.db` is NOT a valid backup: recent
# commits live in the -wal file. This uses better-sqlite3's online `.backup()`
# (SQLite's backup API) to produce a single self-contained file, which is safe
# to take while the app is serving traffic.
#
# It runs in a short-lived `docker compose run` container rather than `exec`ing
# into the app, so it works whether or not the app is currently up, and can
# bind-mount the destination directory straight onto the host — the snapshots
# then survive losing the db-data volume.
#
# Fails loudly: if the database exists but cannot be backed up, the deploy
# should stop rather than run migrations against unprotected data.

set -euo pipefail

SERVICE=app
BACKUP_DIR="${BACKUP_DIR:-$PWD/backups}"
KEEP="${KEEP:-10}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

mkdir -p "$BACKUP_DIR"

# Snapshot inside the container, where better-sqlite3, the db-data volume and
# the real DATABASE_PATH all live. Exit code 3 means "no database file yet"
# (a first deploy), which is not a failure.
set +e
docker compose run --rm --no-deps -T -w /app \
  -v "$BACKUP_DIR:/backup-out" \
  -e "BACKUP_STAMP=$STAMP" \
  "$SERVICE" node -e '
const fs = require("node:fs");
const Database = require("better-sqlite3");

const src = process.env.DATABASE_PATH || "/data/app.db";
if (!fs.existsSync(src)) {
  console.error("backup: no database at " + src + " yet");
  process.exit(3);
}

// Write under a .part name and rename only once the copy verifies, so a
// failure never leaves something that looks like a usable backup.
const final = "/backup-out/app-" + process.env.BACKUP_STAMP + ".db";
const part = final + ".part";
fs.rmSync(part, { force: true });

const db = new Database(src);
db.backup(part)
  .then(() => {
    db.close();
    const copy = new Database(part, { readonly: true });
    const check = copy.pragma("integrity_check", { simple: true });
    const pages = copy.pragma("page_count", { simple: true });
    copy.close();
    if (check !== "ok") throw new Error("integrity_check failed: " + check);
    fs.renameSync(part, final);
    console.log("backup: " + src + " -> " + final + " (" + pages + " pages, integrity ok)");
  })
  .catch((err) => {
    fs.rmSync(part, { force: true });
    console.error("backup: " + (err && err.message ? err.message : err));
    process.exit(1);
  });
'
status=$?
set -e

if [ "$status" -eq 3 ]; then
  echo "backup: nothing to back up"
  exit 0
elif [ "$status" -ne 0 ]; then
  echo "backup: FAILED (exit $status) — refusing to continue the deploy" >&2
  exit "$status"
fi

# Keep the most recent $KEEP snapshots; older ones are just disk. The files are
# written by a root container, but unlinking them only needs write permission on
# the directory, which the deploy user has.
ls -1t "$BACKUP_DIR"/app-*.db 2>/dev/null | tail -n "+$((KEEP + 1))" | while read -r old; do
  echo "backup: pruning $(basename "$old")"
  rm -f "$old"
done
