"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { createClientComponentClient } from "@/lib/supabase";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { NotificationCenter } from "./NotificationCenter";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

/**
 * NotificationBell - Bell icon in top navigation with badge and dropdown
 * 
 * States:
 * - No unread → outline bell, no badge
 * - Has unread → bell with a red dot / count badge (max "9+")
 */
export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const supabase = createClientComponentClient();
  const router = useRouter();

  // Fetch unread count
  const { data: unreadData, mutate: mutateUnread } = useSWR(
    "/api/notifications/unread-count",
    fetcher,
    {
      refreshInterval: 30000, // Refresh every 30 seconds
    }
  );

  useEffect(() => {
    if (unreadData?.count !== undefined) {
      setUnreadCount(unreadData.count);
    }
  }, [unreadData]);

  // Subscribe to realtime notifications
  useEffect(() => {
    let channel: any;

    const setupRealtime = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      channel = supabase
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
            // Refresh unread count when new notification arrives
            mutateUnread();
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
            // Refresh when notification is marked as read
            mutateUnread();
          }
        )
        .subscribe();

      return () => {
        if (channel) {
          supabase.removeChannel(channel);
        }
      };
    };

    setupRealtime();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [supabase, mutateUnread]);

  const handleNotificationClick = (url?: string) => {
    if (url) {
      router.push(url);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors">
        <Bell className="w-5 h-5 text-gray-600" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 text-xs bg-red-500 text-white w-5 h-5 flex items-center justify-center rounded-full font-semibold">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </PopoverTrigger>

      <PopoverContent className="w-96 p-0" align="end">
        <NotificationCenter 
          onNotificationClick={handleNotificationClick}
          onClose={() => setIsOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

