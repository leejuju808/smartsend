// Block 14800 — Hot Lead Alerts v1
// NotificationBell component with hot/warm lead badge

"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { useNotifications } from "@/hooks/useNotifications";
import { createClientComponentClient } from "@/lib/supabase";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { NotificationsList } from "./list";

export function NotificationBell() {
  const { notifications, refresh } = useNotifications();
  const supabase = createClientComponentClient();

  const unreadCount = notifications.filter((n: any) => !n.is_read).length;

  // Subscribe to realtime notifications
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;

      const channel = supabase
        .channel(`notifications:${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            refresh();
          }
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            refresh();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    });
  }, [supabase, refresh]);

  return (
    <Popover>
      <PopoverTrigger className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors">
        <Bell className="w-5 h-5 text-gray-600" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 text-xs bg-red-500 text-white w-5 h-5 flex items-center justify-center rounded-full font-semibold">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </PopoverTrigger>

      <PopoverContent className="w-80 p-0">
        <NotificationsList />
      </PopoverContent>
    </Popover>
  );
}

