import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "../..");

function source(relativePath: string) {
  return readFileSync(resolve(projectRoot, relativePath), "utf8");
}

function localImports(relativePath: string) {
  const contents = source(relativePath);
  const imports = [...contents.matchAll(/(?:import|export)\s+(?:type\s+)?(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g)];
  return imports
    .filter((match) => !match[0].startsWith("import type"))
    .map((match) => match[1])
    .filter((specifier): specifier is string => Boolean(specifier?.startsWith("@/")))
    .map((specifier) => `src/${specifier.slice(2)}`)
    .map((path) => [path, `${path}.ts`, `${path}.tsx`].find((candidate) => existsSync(resolve(projectRoot, candidate))))
    .filter((path): path is string => Boolean(path));
}

function transitiveClientSources(entry: string, seen = new Set<string>()) {
  if (seen.has(entry)) return seen;
  seen.add(entry);
  for (const imported of localImports(entry)) transitiveClientSources(imported, seen);
  return seen;
}

describe("admin client/server boundaries", () => {
  it.each([
    "src/features/admin/login-form.tsx",
    "src/features/admin/logout-form.tsx",
    "src/lib/supabase/browser.ts",
  ])("keeps the %s client import graph free of privileged server modules and keys", (entry) => {
    const graph = [...transitiveClientSources(entry)];
    const bundledSource = graph.map(source).join("\n");

    expect(graph).not.toContain("src/features/admin/auth.ts");
    expect(graph).not.toContain("src/lib/supabase/admin.ts");
    expect(bundledSource).not.toContain('import "server-only"');
    expect(bundledSource).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("marks only login and logout as admin server actions", () => {
    const authSource = source("src/features/admin/auth.ts");
    expect(authSource).not.toMatch(/^\s*["']use server["'];/);
    expect(authSource.match(/\n\s*["']use server["'];/g)).toHaveLength(2);
    expect(authSource).toMatch(/function loginAdmin[\s\S]*?\{\n\s+"use server";/);
    expect(authSource).toMatch(/function logoutAdmin[\s\S]*?\{\n\s+"use server";/);
    expect(authSource).not.toMatch(/function requireAdmin\(\)\s*\{\n\s+"use server";/);
  });
});
