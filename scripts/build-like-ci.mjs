// Runs `next build` exactly as CI does: without any database or mail/storage settings. A page or
// route that touches the database at build time (instead of at request time) fails here, locally,
// rather than only in CI.
import { spawnSync } from "node:child_process";

const env = { ...process.env, NEXT_TELEMETRY_DISABLED: "1" };
for (const key of ["DATABASE_URL", "MIGRATION_DATABASE_URL", "TEST_DATABASE_URL"]) env[key] = "";

const result = spawnSync("npx", ["next", "build"], {
  stdio: "inherit",
  env,
  shell: process.platform === "win32",
});
process.exit(result.status ?? 1);
