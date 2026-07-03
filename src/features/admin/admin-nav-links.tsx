"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/admin/classes", label: "Classes" },
  { href: "/admin/settings", label: "Settings" },
] as const;

export function AdminNavLinks() {
  const pathname = usePathname();

  return (
    <nav aria-label="Administrator">
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={pathname === item.href || pathname.startsWith(`${item.href}/`) ? "page" : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
