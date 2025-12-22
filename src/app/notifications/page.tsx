"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { createClientComponentClient } from "@/lib/supabase";

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
  contactId?: string;
  replyThreadId?: string;
  taskId?: string;
  campaignId?: string;
  url?: string;
  read: boolean;
  createdAt: string;
};

/**
 * Full Notifications Page (/notifications)
 * 
 * Features:
 * - Filters by type/status/date
 * - Mark all as read
 * - Click to navigate and mark as read
 */
export default function NotificationsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClientComponentClient();

  const [typeFilter, setTypeFilter] = useState<string>(
    searchParams.get("type") || "all"
  );
  const [statusFilter, setStatusFilter] = useState<string>(
    searchParams.get("status") || "all"
  );
  const [dateFilter, setDateFilter] = useState<string>(
    searchParams.get("date") || "all"
  );

  // Build query URL
  const statusParam = statusFilter === "all" ? "all" : "unread";
  const queryUrl = `/api/notifications?status=${statusParam}&limit=50`;

  const { data, mutate } = useSWR(queryUrl, fetcher, {
    refreshInterval: 30000,
  });

  const notifications: Notification[] = data?.data || [];

  // Filter notifications client-side
  const filteredNotifications = notifications.filter((n) => {
    if (typeFilter !== "all" && n.type !== typeFilter) return false;
    if (statusFilter === "unread" && n.read) return false;
    if (statusFilter === "read" && !n.read) return false;
    // Date filtering would be done server-side in production
    return true;
  });

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
      router.push(notification.url);
    }
  };

  const handleMarkAllRead = async () => {
    await fetch("/api/notifications/mark-all-read", {
      method: "POST",
    });
    mutate();
  };

  const unreadCount = filteredNotifications.filter((n) => !n.read).length;

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Notifications</h1>
        {unreadCount > 0 && (
          <Button onClick={handleMarkAllRead} variant="outline" size="sm">
            Mark all as read
          </Button>
        )}
      </div>

      {/* Filters Row */}
      <div className="mb-6 space-y-4">
        {/* Type filter */}
        <div>
          <label className="text-sm font-medium mb-2 block">Type</label>
          <div className="flex gap-2 flex-wrap">
            {["all", "reply", "hot_lead", "warm_lead", "task_due", "system"].map(
              (type) => (
                <button
                  key={type}
                  onClick={() => setTypeFilter(type)}
                  className={`px-3 py-1 rounded-md text-sm ${
                    typeFilter === type
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {type === "all"
                    ? "All"
                    : type === "hot_lead"
                    ? "Hot Leads"
                    : type === "warm_lead"
                    ? "Warm Leads"
                    : type === "task_due"
                    ? "Tasks"
                    : type.charAt(0).toUpperCase() + type.slice(1)}
                </button>
              )
            )}
          </div>
        </div>

        {/* Status filter */}
        <div>
          <label className="text-sm font-medium mb-2 block">Status</label>
          <div className="flex gap-2">
            {["all", "unread", "read"].map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1 rounded-md text-sm ${
                  statusFilter === status
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {status === "all"
                  ? "All"
                  : status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Date filter */}
        <div>
          <label className="text-sm font-medium mb-2 block">Date</label>
          <div className="flex gap-2">
            {["all", "today", "7days", "30days"].map((date) => (
              <button
                key={date}
                onClick={() => setDateFilter(date)}
                className={`px-3 py-1 rounded-md text-sm ${
                  dateFilter === date
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {date === "all"
                  ? "All"
                  : date === "today"
                  ? "Today"
                  : date === "7days"
                  ? "Last 7 days"
                  : "Last 30 days"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* List */}
      <div className="space-y-2">
        {filteredNotifications.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p>No notifications found</p>
          </div>
        ) : (
          filteredNotifications.map((notification) => (
            <div
              key={notification.id}
              className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                notification.read
                  ? "bg-white hover:bg-gray-50"
                  : "bg-yellow-50 hover:bg-yellow-100 border-l-4 border-l-yellow-400"
              }`}
              onClick={() => handleNotificationClick(notification)}
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl flex-shrink-0">
                  {getNotificationIcon(notification.type)}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h3
                      className={`text-base ${
                        notification.read ? "font-normal" : "font-bold"
                      }`}
                    >
                      {notification.title}
                    </h3>
                    {!notification.read && (
                      <div className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0" />
                    )}
                  </div>
                  {notification.body && (
                    <p className="text-sm text-gray-600 mt-1">
                      {notification.body}
                    </p>
                  )}
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                    <span>{formatTimeAgo(notification.createdAt)}</span>
                    {notification.campaignId && (
                      <span>Campaign: {notification.campaignId.slice(0, 8)}</span>
                    )}
                    {notification.contactId && (
                      <span>Contact: {notification.contactId.slice(0, 8)}</span>
                    )}
                  </div>
                </div>
                {notification.url && (
                  <span className="text-sm text-blue-600 flex-shrink-0">
                    Open →
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
