import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const buildDirectory = resolve(process.argv[2] ?? ".next");
const manifestPath = resolve(buildDirectory, "server/server-reference-manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

const expectedPrivilegedActionFiles = new Map([
  ["src/features/admin/auth.ts", 2],
  ["src/features/classes/admin-actions.ts", 6],
  ["src/features/settings/admin-actions.ts", 5],
  ["src/features/reminders/actions.ts", 1],
]);
const privilegedActions = new Map(
  Array.from(expectedPrivilegedActionFiles.keys(), (filename) => [filename, new Map()]),
);
for (const runtime of [manifest.node ?? {}, manifest.edge ?? {}]) {
  for (const [id, reference] of Object.entries(runtime)) {
    if (expectedPrivilegedActionFiles.has(reference.filename)) {
      privilegedActions.get(reference.filename).set(id, reference);
    }
  }
}

let privilegedActionCount = 0;
for (const [filename, expectedCount] of expectedPrivilegedActionFiles) {
  const actualCount = privilegedActions.get(filename).size;
  privilegedActionCount += actualCount;
  if (actualCount !== expectedCount) {
    throw new Error(
      `Expected exactly ${expectedCount} server actions from ${filename}, found ${actualCount}`,
    );
  }
}

function filesWithin(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? filesWithin(path) : [path];
  });
}

const serverDirectory = resolve(buildDirectory, "server");
const middlewareEntry = resolve(serverDirectory, "middleware.js");
if (!existsSync(middlewareEntry)) {
  throw new Error("Expected the admin auth refresh proxy middleware entry to be emitted");
}

const functionsConfigPath = resolve(serverDirectory, "functions-config-manifest.json");
const functionsConfig = existsSync(functionsConfigPath)
  ? JSON.parse(readFileSync(functionsConfigPath, "utf8"))
  : null;
const hasAdminMatcherInManifest = Object.values(functionsConfig?.functions ?? {}).some((entry) =>
  Array.isArray(entry?.matchers) && entry.matchers.some((matcher) =>
    matcher?.originalSource === "/admin/:path*" ||
    (typeof matcher?.regexp === "string" && matcher.regexp.includes("\\/admin")),
  ),
);

const serverJavaScript = filesWithin(serverDirectory)
  .filter((file) => file.endsWith(".js"))
  .map((file) => readFileSync(file, "utf8"))
  .join("\n");
const hasPublicSupabaseMarker =
  serverJavaScript.includes("NEXT_PUBLIC_SUPABASE_URL") ||
  serverJavaScript.includes("publishableKey");
if (
  !(serverJavaScript.includes("/admin/:path*") || hasAdminMatcherInManifest) ||
  !serverJavaScript.includes("createServerClient") ||
  !hasPublicSupabaseMarker
) {
  throw new Error("Expected the admin auth refresh proxy to be registered for /admin routes");
}

const forbiddenValues = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "src/features/admin/auth.ts",
  "src/features/classes/admin-actions.ts",
  "src/features/settings/admin-actions.ts",
  "src/features/reminders/actions.ts",
  "src/lib/supabase/admin.ts",
  process.env.SUPABASE_SERVICE_ROLE_KEY,
].filter((value) => typeof value === "string" && (value.startsWith("SUPABASE_") || value.startsWith("src/") || value.length >= 16));

for (const asset of filesWithin(resolve(buildDirectory, "static"))) {
  const contents = readFileSync(asset);
  for (const forbidden of forbiddenValues) {
    if (contents.includes(forbidden)) {
      throw new Error(`Client asset ${asset} contains a privileged server value`);
    }
  }
}

console.log(`Build boundaries verified: verified ${privilegedActionCount} privileged server actions and clean client assets.`);
