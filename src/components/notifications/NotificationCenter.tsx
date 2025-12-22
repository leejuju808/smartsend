"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { createClientComponentClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

function getNotificationIcon(type: string, category?: string): string {
  // Category-based icons
  if (category === "lead") {
    if (type === "hot_lead") return "🔥";
    if (type === "warm_lead") return "🔥";
    if (type === "reply") return "💬";
    if (type === "sms_received") return "📱";
    if (type === "thread_resurfaced") return "🔔";
  }
  if (category === "task") {
    if (type === "task_assigned") return "✅";
    if (type === "task_due") return "⏰";
    if (type === "task_overdue") return "⚠️";
    if (type === "task_completed") return "✓";
  }
  if (category === "call") {
    if (type === "missed_call") return "📞";
    if (type === "call_followup_due") return "📞";
  }
  if (category === "campaign") {
    if (type === "campaign_paused") return "⏸️";
    if (type === "campaign_limit_reached") return "📊";
    if (type === "deliverability_issue") return "⚠️";
    if (type === "warmup_warning") return "🔥";
  }
  if (category === "billing") {
    if (type === "billing_issue") return "💳";
    if (type === "plan_limit_reached") return "📊";
    if (type === "subscription_past_due") return "💳";
  }
  
  // Fallback to type-based icons
  switch (type) {
    case "hot_lead":
    case "warm_lead":
      return "🔥";
    case "reply":
      return "💬";
    case "task_due":
    case "task_assigned":
      return "⏰";
    case "missed_call":
      return "📞";
    case "system":
      return "✅";
    default:
      return "🔔";
  }
}

type Notification = {
  id: string;
  category?: "lead" | "task" | "call" | "campaign" | "billing";
  type: string;
  title: string;
  body?: string;
  url?: string;
  read: boolean;
  is_read?: boolean;
  createdAt: string;
  created_at?: string;
};

interface NotificationCenterProps {
  onNotificationClick?: (url?: string) => void;
  onClose?: () => void;
  initialCategory?: string;
}

/**
 * NotificationCenter - Enhanced notification panel with tabs by category
 * 
 * Features:
 * - Tabs: All, Leads, Tasks, System (includes calls, campaigns, billing)
 * - Real-time updates via Supabase Realtime
 * - Mark as read / Mark all as read
 * - Category icons
 */
export function NotificationCenter({
  onNotificationClick,
  onClose,
  initialCategory = "all",
}: NotificationCenterProps) {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [activeTab, setActiveTab] = useState(initialCategory);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Fetch notifications
  const { data, mutate } = useSWR(
    `/api/notifications?limit=50`,
    fetcher,
    {
      refreshInterval: 30000,
    }
  );

  useEffect(() => {
    if (data?.notifications) {
      setNotifications(data.notifications);
    } else if (data?.data) {
      // Handle alternative API response format
      setNotifications(data.data);
    }
  }, [data]);

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
    const isRead = notification.is_read ?? notification.read;
    
    // Mark as read if unread
    if (!isRead) {
      await fetch(`/api/notifications/${notification.id}/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ read: true }),
      });
      mutate();
    }

    // Navigate to URL
    if (notification.url) {
      if (onNotificationClick) {
        onNotificationClick(notification.url);
      } else {
        router.push(notification.url);
      }
      if (onClose) onClose();
    }
  };

  const handleMarkAllRead = async () => {
    await fetch("/api/notifications/mark-all-read", {
      method: "POST",
    });
    mutate();
  };

  // Filter notifications by category
  const filteredNotifications = notifications.filter((n) => {
    if (activeTab === "all") return true;
    if (activeTab === "leads") return n.category === "lead";
    if (activeTab === "tasks") return n.category === "task";
    if (activeTab === "system") {
      return n.category === "call" || n.category === "campaign" || n.category === "billing" || n.type === "system";
    }
    return true;
  });

  const unreadCount = filteredNotifications.filter(
    (n) => !(n.is_read ?? n.read)
  ).length;
  const hasUnread = unreadCount > 0;

  return (
    <div className="w-96 max-h-[600px] flex flex-col">
      {/* Header */}
      <div className="p-3 border-b flex items-center justify-between flex-shrink-0">
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

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-4 mx-2 mt-2 flex-shrink-0">
          <TabsTrigger value="all" className="text-xs">
            All {unreadCount > 0 && `(${unreadCount})`}
          </TabsTrigger>
          <TabsTrigger value="leads" className="text-xs">
            Leads
          </TabsTrigger>
          <TabsTrigger value="tasks" className="text-xs">
            Tasks
          </TabsTrigger>
          <TabsTrigger value="system" className="text-xs">
            System
          </TabsTrigger>
        </TabsList>

        {/* Notifications List */}
        <TabsContent value={activeTab} className="flex-1 overflow-y-auto mt-0">
          {filteredNotifications.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">
              No notifications
            </p>
          ) : (
            <div className="space-y-1 p-2">
              {filteredNotifications.map((notification) => {
                const isRead = notification.is_read ?? notification.read;
                const createdAt = notification.created_at ?? notification.createdAt;
                
                return (
                  <div
                    key={notification.id}
                    className={`p-3 cursor-pointer transition-colors border-b rounded-lg ${
                      isRead
                        ? "bg-white hover:bg-gray-50"
                        : "bg-yellow-50 hover:bg-yellow-100"
                    }`}
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-lg flex-shrink-0">
                        {getNotificationIcon(notification.type, notification.category)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-sm ${
                            isRead ? "font-normal" : "font-bold"
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
                            {formatTimeAgo(createdAt)}
                          </p>
                          {notification.url && (
                            <span className="text-xs text-blue-600">Open →</span>
                          )}
                        </div>
                      </div>
                      {!isRead && (
                        <div className="w-2 h-2 bg-red-500 rounded-full mt-1.5 flex-shrink-0" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

