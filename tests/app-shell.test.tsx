import { within } from "@testing-library/react";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => ({
  Inter: () => ({ variable: "font-inter" }),
}));

describe("application shell", () => {
  it("provides an accessible parent access page", async () => {
    expect(existsSync(path.resolve("src/app/access/page.tsx"))).toBe(true);
    expect(existsSync(path.resolve("src/app/layout.tsx"))).toBe(true);

    const pageModule = "@/app/access/page";
    const layoutModule = "@/app/layout";
    const [{ default: Home }, { default: RootLayout }] = await Promise.all([
      import(/* @vite-ignore */ pageModule),
      import(/* @vite-ignore */ layoutModule),
    ]);

    document.open();
    document.write(renderToStaticMarkup(<RootLayout><Home /></RootLayout>));
    document.close();
    const page = within(document.body);

    expect(page.getByRole("link", { name: /skip to main content/i })).toHaveAttribute(
      "href",
      "#main-content",
    );
    expect(page.getByRole("main")).toHaveAttribute("id", "main-content");
    expect(page.getByRole("main").querySelector(".access-page")).toBeInTheDocument();
    expect(page.getByLabelText(/access code/i)).toHaveAttribute("type", "password");
    expect(page.getByRole("button", { name: /view calendar/i })).toBeInTheDocument();
  });
});
