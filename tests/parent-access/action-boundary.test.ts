// @vitest-environment node

import { describe, expect, it } from "vitest";

describe("parent access server-action boundary", () => {
  it("exposes only the request action from the use-server module", async () => {
    const actions = await import("@/features/parent-access/actions");
    expect(Object.keys(actions)).toEqual(["requestParentAccess"]);
  });
});
