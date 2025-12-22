"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * AUREV HQ Unified Navigation Bar
 * 
 * Provides seamless switching between SmartSend, OpsGrid, and AgentCloud.
 * Displays on all dashboard pages across the AUREV ecosystem.
 */
export default function AUREVNavBar() {
  const pathname = usePathname();
  
  // Determine which app we're currently in
  const currentApp = pathname?.includes("/aurev-hq") 
    ? "aurevhq"
    : pathname?.includes("/opsgrid") 
    ? "opsgrid"
    : pathname?.includes("/agentcloud")
    ? "agentcloud"
    : "smartsend";

  const apps = [
    {
      name: "SmartSend",
      url: process.env.NEXT_PUBLIC_SMARTSEND_URL || "https://smartsendhq.com/dashboard",
      current: currentApp === "smartsend",
    },
    {
      name: "OpsGrid",
      url: process.env.NEXT_PUBLIC_OPSGRID_URL || "https://opsgridhq.com/dashboard",
      current: currentApp === "opsgrid",
    },
    {
      name: "Agent Cloud",
      url: process.env.NEXT_PUBLIC_AGENTCLOUD_URL || "https://agentcloudapp.com/dashboard",
      current: currentApp === "agentcloud",
    },
    {
      name: "AUREV HQ ⚡",
      url: process.env.NEXT_PUBLIC_AUREVHQ_URL || "/aurev-hq/dashboard",
      current: currentApp === "aurevhq",
      highlight: true,
    },
  ];

  return (
    <nav className="flex gap-4 bg-black text-white px-6 py-3 text-sm items-center">
      {apps.map((app) => (
        <Link
          key={app.name}
          href={app.url}
          className={`px-3 py-1 rounded transition-colors ${
            app.highlight
              ? "ml-auto text-amber-400 font-semibold hover:text-amber-300"
              : app.current
              ? "bg-gray-800 text-white"
              : "text-gray-300 hover:text-white hover:bg-gray-800"
          }`}
        >
          {app.name}
        </Link>
      ))}
    </nav>
  );
}

