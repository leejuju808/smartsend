"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, Zap, Calendar, BarChart3, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabaseBrowser";

/**
 * Mobile App Home Screen
 * Entry point for the mobile app - shows quick navigation to 5 core screens
 */
export default function MobileHomePage() {
  const router = useRouter();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    async function loadWorkspace() {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
        return;
      }

      // Get user's workspace
      const { data: workspaces } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", session.user.id)
        .limit(1)
        .single();

      if (workspaces) {
        setWorkspaceId(workspaces.workspace_id);
      }
    }
    loadWorkspace();
  }, [router]);

  const navItems = [
    {
      id: "inbox",
      title: "Lead Inbox",
      subtitle: "HOT leads at top",
      icon: MessageSquare,
      href: "/mobile/inbox",
      color: "bg-red-500",
    },
    {
      id: "campaigns",
      title: "Launch Campaign",
      subtitle: "One-tap presets",
      icon: Zap,
      href: "/mobile/campaigns",
      color: "bg-blue-500",
    },
    {
      id: "book",
      title: "Book Appointment",
      subtitle: "Schedule estimates",
      icon: Calendar,
      href: "/mobile/book",
      color: "bg-green-500",
    },
    {
      id: "dashboard",
      title: "Scoreboard",
      subtitle: "How’s business? The truth screen.",
      icon: BarChart3,
      href: "/mobile/dashboard",
      color: "bg-purple-500",
    },
    {
      id: "alerts",
      title: "Storm Alerts",
      subtitle: "Weather notifications",
      icon: AlertTriangle,
      href: "/mobile/alerts",
      color: "bg-orange-500",
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-4 py-6">
        <h1 className="text-2xl font-bold">SmartSend</h1>
        <p className="text-sm text-gray-600 mt-1">Your pocket office assistant</p>
      </div>

      {/* Navigation Grid */}
      <div className="p-4 space-y-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => router.push(item.href)}
              className="w-full bg-white rounded-xl p-4 flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className={`${item.color} p-3 rounded-lg`}>
                <Icon className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1 text-left">
                <div className="font-semibold text-gray-900">{item.title}</div>
                <div className="text-sm text-gray-500">{item.subtitle}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}




































