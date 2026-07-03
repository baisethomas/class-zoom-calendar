import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const verifier = resolve(import.meta.dirname, "../../scripts/verify-build-boundaries.mjs");
const temporaryDirectories: string[] = [];

function fixture({
  authActionCount = 2,
  classActionCount = 6,
  settingsActionCount = 5,
  remindersActionCount = 1,
  staticAsset = "safe client code",
  matcherInFunctionsManifest = false,
  publicConfigMarker = "env",
} = {}) {
  const root = mkdtempSync(join(tmpdir(), "admin-boundary-"));
  temporaryDirectories.push(root);
  const server = join(root, "server");
  const chunks = join(server, "chunks");
  const client = join(root, "static/chunks");
  mkdirSync(server, { recursive: true });
  mkdirSync(chunks, { recursive: true });
  mkdirSync(client, { recursive: true });
  const authActions = Object.fromEntries(
    Array.from({ length: authActionCount }, (_, index) => [String(index), {
      filename: "src/features/admin/auth.ts",
      exportedName: `$$RSC_SERVER_ACTION_${index}`,
    }]),
  );
  const classActions = Object.fromEntries(
    Array.from({ length: classActionCount }, (_, index) => [String(index + authActionCount), {
      filename: "src/features/classes/admin-actions.ts",
      exportedName: `$$RSC_SERVER_ACTION_${index + authActionCount}`,
    }]),
  );
  const settingsActions = Object.fromEntries(
    Array.from({ length: settingsActionCount }, (_, index) => [String(index + authActionCount + classActionCount), {
      filename: "src/features/settings/admin-actions.ts",
      exportedName: `$$RSC_SERVER_ACTION_${index + authActionCount + classActionCount}`,
    }]),
  );
  const remindersActions = Object.fromEntries(
    Array.from({ length: remindersActionCount }, (_, index) => {
      const id = index + authActionCount + classActionCount + settingsActionCount;
      return [String(id), {
        filename: "src/features/reminders/actions.ts",
        exportedName: `$$RSC_SERVER_ACTION_${id}`,
      }];
    }),
  );
  const node = { ...authActions, ...classActions, ...settingsActions, ...remindersActions };
  writeFileSync(join(server, "server-reference-manifest.json"), JSON.stringify({ node, edge: {} }));
  writeFileSync(join(server, "middleware.js"), "require('./chunks/proxy.js')");
  writeFileSync(
    join(chunks, "proxy.js"),
    `${matcherInFunctionsManifest ? "" : "const matcher='/admin/:path*'; "}createServerClient(); ${
      publicConfigMarker === "publishable"
        ? "const publishableKey='sb_publishable';"
        : "process.env.NEXT_PUBLIC_SUPABASE_URL;"
    }`,
  );
  if (matcherInFunctionsManifest) {
    writeFileSync(
      join(server, "functions-config-manifest.json"),
      JSON.stringify({
        version: 1,
        functions: {
          "/_middleware": {
            runtime: "nodejs",
            matchers: [{ originalSource: "/admin/:path*" }],
          },
        },
      }),
    );
  }
  writeFileSync(join(client, "app.js"), staticAsset);
  return root;
}

function verify(root: string) {
  const result = spawnSync(process.execPath, [verifier, root], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true });
});

describe("production build boundary verifier", () => {
  it("accepts the exact expected admin and class actions with clean static assets", () => {
    expect(verify(fixture())).toContain("verified 14 privileged server actions");
  });

  it("accepts a build where the admin matcher is emitted in functions-config-manifest.json", () => {
    expect(verify(fixture({ matcherInFunctionsManifest: true }))).toContain(
      "verified 14 privileged server actions",
    );
  });

  it("accepts a build where the proxy bundle retains a publishable-key marker instead of the env variable name", () => {
    expect(verify(fixture({ publicConfigMarker: "publishable" }))).toContain(
      "verified 14 privileged server actions",
    );
  });

  it("rejects an unexpected dependency-injected helper exported as a class action", () => {
    expect(() => verify(fixture({ classActionCount: 7 }))).toThrow(
      /expected exactly 6 server actions from src\/features\/classes\/admin-actions\.ts/i,
    );
  });

  it("rejects an unexpected dependency-injected helper exported as a settings action", () => {
    expect(() => verify(fixture({ settingsActionCount: 6 }))).toThrow(
      /expected exactly 5 server actions from src\/features\/settings\/admin-actions\.ts/i,
    );
  });

  it("rejects a build where the admin proxy is not registered", () => {
    const root = fixture();
    rmSync(join(root, "server/middleware.js"));
    expect(() => verify(root)).toThrow(/admin auth refresh proxy/i);
  });

  it.each([
    "SUPABASE_SERVICE_ROLE_KEY",
    "service-role-value",
    "src/features/settings/admin-actions.ts",
  ])(
    "rejects privileged marker %s in a client asset",
    (marker) => {
      const previous = process.env.SUPABASE_SERVICE_ROLE_KEY;
      process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-value";
      try {
      expect(() => verify(fixture({ staticAsset: `client contains ${marker}` }))).toThrow(/privileged server value/i);
      } finally {
        if (previous === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
        else process.env.SUPABASE_SERVICE_ROLE_KEY = previous;
      }
    },
  );
});
