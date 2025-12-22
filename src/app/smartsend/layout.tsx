"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function SmartSendLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="border-b border-zinc-800">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-8">
              <h1 className="text-xl font-bold">SmartSend</h1>
              <nav className="flex space-x-6">
                <Link
                  href="/smartsend"
                  className={`text-sm ${
                    pathname === "/smartsend"
                      ? "text-yellow-400"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  Scheduler
                </Link>
                <Link
                  href="/smartsend/runs"
                  className={`text-sm ${
                    pathname === "/smartsend/runs"
                      ? "text-yellow-400"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  Runs
                </Link>
              </nav>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <main>{children}</main>
    </div>
  );
}