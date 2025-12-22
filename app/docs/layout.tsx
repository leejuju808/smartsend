import type { ReactNode } from "react";
import Link from "next/link";

const SECTIONS = [
  { href: "/docs", label: "Overview" },
  { href: "/docs#stack", label: "Stack" },
  { href: "/docs#features", label: "Key Features" },
  { href: "/docs#env", label: "Environment Variables" },
  { href: "/docs#db-funcs", label: "Database & Functions" },
  { href: "/docs#api", label: "API Routes" },
  { href: "/docs#reply-detection", label: "Reply Detection" },
  { href: "/docs#ui", label: "UI Highlights" },
  { href: "/docs#e2e", label: "E2E Test" },
  { href: "/docs#billing", label: "Billing Gates" },
  { href: "/docs#security", label: "Security Notes" },
  { href: "/docs#troubleshooting", label: "Troubleshooting" },
];

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6">
        <aside className="md:sticky md:top-6 h-fit md:self-start border rounded-xl p-3">
          <div className="text-sm font-semibold mb-2">SmartSend Docs</div>
          <nav className="text-sm space-y-1">
            {SECTIONS.map((s) => (
              <div key={s.href}>
                <Link href={s.href} className="text-muted-foreground hover:text-foreground">
                  {s.label}
                </Link>
              </div>
            ))}
          </nav>
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}


