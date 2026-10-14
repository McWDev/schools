// Fails if anything that looks like a database credential reached the browser bundle.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = ".next/static";
const patterns = [
  /postgres(ql)?:\/\//i,
  /neon\.tech/i,
  /npg_[A-Za-z0-9]{8,}/,
  /DATABASE_URL/,
  /app_runtime/,
];

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else yield path;
  }
}

let checked = 0;
const leaks = [];
for (const file of files(root)) {
  checked += 1;
  const text = readFileSync(file, "utf8");
  for (const pattern of patterns) if (pattern.test(text)) leaks.push(`${file}: ${pattern}`);
}

if (leaks.length) {
  console.error("Possible secrets in client bundle:\n" + leaks.join("\n"));
  process.exit(1);
}
console.log(`Client bundle clean (${checked} files checked).`);
