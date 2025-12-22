"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { createClientComponentClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return "just now";
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 2592000)
    return `${Math.floor(diffInSeconds / 86400)}d ago`;
  return date.toLocaleDateString();
}

function getNotificationIcon(type: string): string {
  switch (type) {
    case "hot_lead":
    case "warm_lead":
      return "🔥";
    case "reply":
      return "💬";
    case "task_due":
      return "⏰";
    case "system":
      return "✅";
    default:
      return "🔔";
  }
}

type Notification = {
  id: string;
  type: "reply" | "hot_lead" | "warm_lead" | "task_due" | "system";
  title: string;
  body?: string;
  url?: string;
  read: boolean;
  createdAt: string;
};

interface NotificationDropdownProps {
  onNotificationClick: (url?: string) => void;
  onClose: () => void;
}

/**
 * NotificationDropdown - Dropdown panel showing last ~7-10 notifications
 * 
 * Structure:
 * - Title row: "Notifications" + "View all" link
 * - List of last ~7-10 notifications (most recent first)
 * - "Mark all as read" link/button
 */
export function NotificationDropdown({
  onNotificationClick,
  onClose,
}: NotificationDropdownProps) {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const { data, mutate } = useSWR(
    "/api/notifications?unreadOnly=true&limit=10",
    fetcher,
    {
      refreshInterval: 30000,
    }
  );

  const notifications: Notification[] = data?.notifications || data?.data || [];
  const hasUnread = notifications.some((n) => !n.read);

  // Subscribe to realtime updates
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
            event: "*",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            mutate();
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
  }, [supabase, mutate]);

  const handleNotificationClick = async (notification: Notification) => {
    // Mark as read if unread
    if (!notification.read) {
      await fetch(`/api/notifications/${notification.id}/read`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ read: true }),
      });
      mutate();
    }

    // Navigate to URL
    if (notification.url) {
      onNotificationClick(notification.url);
      onClose();
    }
  };

  const handleMarkAllRead = async () => {
    await fetch("/api/notifications/mark-all-read", {
      method: "POST",
    });
    mutate();
  };

  return (
    <div className="w-96">
      {/* Title row */}
      <div className="p-3 border-b flex items-center justify-between">
        <h3 className="font-semibold text-lg">Notifications</h3>
        <div className="flex items-center gap-2">
          {hasUnread && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAllRead}
              className="text-xs h-7"
            >
              Mark all as read
            </Button>
          )}
          <Link
            href="/notifications"
            className="text-xs text-blue-600 hover:underline"
            onClick={onClose}
          >
            View all
          </Link>
        </div>
      </div>

      {/* List of notifications */}
      <div className="max-h-96 overflow-y-auto">
        {notifications.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">
            No unread notifications
          </p>
        ) : (
          <div className="space-y-1">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={`p-3 cursor-pointer transition-colors border-b ${
                  notification.read
                    ? "bg-white hover:bg-gray-50"
                    : "bg-yellow-50 hover:bg-yellow-100"
                }`}
                onClick={() => handleNotificationClick(notification)}
              >
                <div className="flex items-start gap-2">
                  <span className="text-lg flex-shrink-0">
                    {getNotificationIcon(notification.type)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm ${
                        notification.read ? "font-normal" : "font-bold"
                      }`}
                    >
                      {notification.title}
                    </p>
                    {notification.body && (
                      <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                        {notification.body}
                      </p>
                    )}
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-xs text-gray-400">
                        {formatTimeAgo(notification.createdAt)}
                      </p>
                      {notification.url && (
                        <span className="text-xs text-blue-600">Open →</span>
                      )}
                    </div>
                  </div>
                  {!notification.read && (
                    <div className="w-2 h-2 bg-red-500 rounded-full mt-1.5 flex-shrink-0" />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}



