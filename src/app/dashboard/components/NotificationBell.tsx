"use client";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";

export default function NotificationBell() {
  const [notifs, setNotifs] = useState<any[]>([]);
  const [open, setOpen] = useState(false);

  async function fetchNotifs() {
    const res = await fetch("/api/notifications");
    const data = await res.json();
    setNotifs(data.notifications || []);
  }

  async function markRead(id: string) {
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    fetchNotifs();
  }

  useEffect(() => {
    fetchNotifs();
    const i = setInterval(fetchNotifs, 10000);
    return () => clearInterval(i);
  }, []);

  const unread = notifs.filter(n => !n.read).length;

  return (
    <div className="relative">
      <button onClick={()=>setOpen(!open)} className="relative">
        <Bell className="h-6 w-6" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full px-1">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-72 bg-white border shadow-lg rounded-lg z-50">
          {notifs.length === 0 ? (
            <p className="text-sm p-3 text-zinc-500">No notifications</p>
          ) : (
            notifs.map(n => (
              <div key={n.id} className={`p-3 border-b ${n.read ? "bg-gray-50" : "bg-white"}`}>
                <div className="font-semibold text-sm">{n.title}</div>
                <div className="text-xs text-zinc-600">{n.message}</div>
                <button className="text-xs text-blue-500 mt-1" onClick={()=>markRead(n.id)}>Mark Read</button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}