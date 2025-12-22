import type { ReactNode } from "react";
import Link from "next/link";
import { OwnerSnapshotBar } from "@/components/owner/OwnerSnapshotBar";

const navItems = [
  { href: "/dashboard", label: "Scoreboard" },
  { href: "/dashboard/revenue-weapon", label: "Revenue" },
  { href: "/inbox", label: "Inbox" },
  { href: "/estimates", label: "Estimates" },
  { href: "/inventory", label: "Inventory" },
  { href: "/purchase-orders", label: "Purchase Orders" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/settings", label: "Settings" },
  { href: "/billing", label: "Billing" },
];

export default function OwnerLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside className="hidden md:flex md:flex-col w-56 bg-slate-900 text-slate-100">
        <div className="px-4 py-4 border-b border-slate-800">
          <div className="text-xs uppercase tracking-wide text-slate-400">
            SmartSend
          </div>
          <div className="text-sm font-semibold text-white">
            Roofing Command
          </div>
        </div>

        <nav className="flex-1 px-2 py-4 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block px-3 py-2 rounded-md text-sm text-slate-200 hover:bg-slate-800"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-slate-800 text-xs text-slate-400">
          <p>Built for roofers.</p>
          <p>Leads → Jobs → Revenue.</p>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 flex flex-col">
        {/* Top bar */}
        <header className="h-14 px-4 md:px-6 border-b bg-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-900">
              Owner Command Center
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded-full border border-amber-300 bg-amber-50 text-amber-700">
              Roofing Beta
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-600">
            <span>Powered by SmartSend</span>
            <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-[11px] font-semibold">
              RO
            </div>
          </div>
        </header>

        <OwnerSnapshotBar />

        {/* Page content */}
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}




