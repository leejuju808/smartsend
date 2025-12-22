import Link from "next/link";
import { getUnreadCount } from "@/lib/notifications";

export default async function TopbarNotifications() {
  const count = await getUnreadCount();
  return (
    <Link href="/dashboard/inbox">
      <div className="relative">
        <span className="text-sm">Inbox</span>
        {count > 0 && (
          <span className="absolute -right-2 -top-2 rounded-full bg-primary text-primary-foreground text-xs px-2 py-0.5">
            {count}
          </span>
        )}
      </div>
    </Link>
  );
}

