"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { createClientComponentClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export function LeadNotificationBell() {
  const [unseen, setUnseen] = useState(0);
  const supabase = createClientComponentClient();

  useEffect(() => {
    const fetchUnseen = async () => {
      const { count } = await supabase
        .from("lead_notifications")
        .select("id", { count: "exact", head: true })
        .is("seen_at", null);

      setUnseen(count ?? 0);
    };

    fetchUnseen();

    // Subscribe to realtime updates
    const channel = supabase
      .channel("lead_notifications_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "lead_notifications",
        },
        () => {
          fetchUnseen();
        }
      )
      .subscribe();

    // Refresh every 30 seconds
    const interval = setInterval(fetchUnseen, 30000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [supabase]);

  return (
    <Link href="/notifications" className="relative">
      <Bell className="h-5 w-5 text-muted-foreground hover:text-foreground" />
      {unseen > 0 && (
        <span
          className={cn(
            "absolute -top-1 -right-1 h-4 min-w-[16px] rounded-full bg-red-500 text-[10px] font-semibold text-white flex items-center justify-center px-1"
          )}
        >
          {unseen > 9 ? "9+" : unseen}
        </span>
      )}
    </Link>
  );
}































































