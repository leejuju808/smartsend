"use client";

import { useEffect } from "react";
import useSWR from "swr";
import { createClientComponentClient } from "@/lib/supabase";
import Link from "next/link";
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

async function markAsRead(id: string) {
  await fetch(`/api/notifications/${id}/read`, {
    method: "PATCH",
  });
}

export function NotificationsList() {
  const supabase = createClientComponentClient();
  const { data, mutate } = useSWR("/api/notifications?limit=20", fetcher, {
    refreshInterval: 30000,
  });

  const notifications = data || [];

  // Subscribe to realtime updates
  useEffect(() => {
    const { data: { user } } = supabase.auth.getUser();
    if (!user) return;

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;

      const channel = supabase
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
        supabase.removeChannel(channel);
      };
    });
  }, [supabase, mutate]);

  const handleNotificationClick = async (notification: any) => {
    if (!notification.is_read) {
      await markAsRead(notification.id);
      mutate();
    }
  };

  return (
    <div className="w-80">
      <div className="p-3 border-b flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-lg">Notifications</h3>
          <div className="text-[10px] text-gray-500">
            {notifications.filter((n: any) => !n.is_read).length} unread
          </div>
        </div>
      </div>

      <div className="max-h-96 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="text-[11px] text-gray-500 p-2">
            No notifications yet. Hot and warm leads will show up here.
          </div>
        ) : (
          <div className="space-y-1">
            {notifications.map((n: any) => (
              <div
                key={n.id}
                className={`p-2 rounded-xl text-[11px] cursor-pointer ${
                  n.is_read ? "bg-white" : "bg-slate-50"
                }`}
                onClick={() => handleNotificationClick(n)}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{n.title}</span>
                  <span className="text-[10px] text-gray-500">
                    {new Date(n.created_at).toLocaleTimeString()}
                  </span>
                </div>
                <div className="text-gray-600 line-clamp-2 mt-0.5">
                  {n.body}
                </div>
                {n.contacts && (
                  <div className="text-[10px] text-gray-500 mt-0.5">
                    {n.contacts.first_name || n.contacts.last_name
                      ? `${n.contacts.first_name || ""} ${
                          n.contacts.last_name || ""
                        }`
                      : n.contacts.email}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-2 text-[10px] text-gray-500 text-right px-2 pb-2">
        Notifications for hot and warm leads.
      </div>
    </div>
  );
}










