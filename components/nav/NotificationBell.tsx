"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: any;
  is_read: boolean;
  created_at: string;
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<Notification[]>([]);

  const loadUnread = async () => {
    const res = await fetch("/api/notifications/unread");
    const json = await res.json();
    setUnread(json.unread || 0);
  };

  const loadList = async () => {
    const res = await fetch("/api/notifications/list");
    const json = await res.json();
    setItems(json.notifications || []);
  };

  const markAllRead = async () => {
    const ids = items.filter((n) => !n.is_read).map((n) => n.id);
    if (ids.length === 0) return;
    await fetch("/api/notifications/mark-read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    await Promise.all([loadUnread(), loadList()]);
  };

  useEffect(() => {
    loadUnread();
    const interval = setInterval(loadUnread, 15000);
    return () => clearInterval(interval);
  }, []);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      loadList();
    }
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5" />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-[10px] text-white rounded-full px-1">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <span className="text-xs font-semibold">Notifications</span>
          <Button
            variant="ghost"
            size="xs"
            className="text-[11px]"
            onClick={markAllRead}
          >
            Mark all read
          </Button>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {items.length === 0 && (
            <div className="p-3 text-xs text-muted-foreground">
              No notifications yet.
            </div>
          )}
          {items.map((n) => (
            <div
              key={n.id}
              className={`px-3 py-2 border-b text-xs ${
                !n.is_read ? "bg-muted/70" : ""
              }`}
            >
              <div className="font-medium flex items-center gap-1">
                <span className="capitalize text-[11px] text-muted-foreground">
                  {n.type}
                </span>
                <span>{n.title}</span>
              </div>
              {n.body && (
                <div className="text-[11px] text-muted-foreground">
                  {n.body}
                </div>
              )}
              <div className="text-[10px] text-muted-foreground mt-1">
                {new Date(n.created_at).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}







