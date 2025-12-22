"use client";

import { Card } from "@/components/ui/card";
import { formatDistanceToNow, format } from "date-fns";

export function LeadTimeline({ items }: { items: any[] }) {
  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-semibold">Lead Timeline</h1>
      <p className="text-sm text-muted-foreground">
        All activity in one place.
      </p>

      <Card className="divide-y">
        {items.map((event: any, i: number) => {
          const ts = new Date(event.created_at);

          const isEmailEvent = event.event_type !== undefined;

          return (
            <div key={event.id} className="p-4">
              <div className="flex items-center justify-between">
                <span className="font-medium">
                  {isEmailEvent ? renderEmailEventTitle(event) : renderActivityTitle(event)}
                </span>

                <span className="text-xs text-muted-foreground">
                  {format(ts, "PPP p")} ({formatDistanceToNow(ts)} ago)
                </span>
              </div>

              {isEmailEvent && event.body_text && (
                <p className="mt-2 text-sm text-muted-foreground whitespace-pre-line">
                  {event.body_text}
                </p>
              )}

              {!isEmailEvent && event.activity_data && (
                <pre className="mt-2 text-xs bg-muted p-2 rounded">
                  {JSON.stringify(event.activity_data, null, 2)}
                </pre>
              )}
            </div>
          );
        })}
      </Card>
    </div>
  );
}

function renderEmailEventTitle(event: any) {
  if (event.direction === "outbound") {
    if (event.event_type === "sent") return "Email sent";
    if (event.event_type === "delivered") return "Delivered";
    if (event.event_type === "open" || event.event_type === "opened") return "Opened";
    if (event.event_type === "click" || event.event_type === "clicked") return "Link clicked";
  }

  if (event.direction === "inbound" && (event.event_type === "reply" || event.event_type === "replied")) {
    if (event.reply_reason) {
      return `Reply received (${event.reply_reason})`;
    }
    return "Reply received";
  }

  return event.event_type;
}

function renderActivityTitle(event: any) {
  switch (event.activity_type) {
    case "follow_up_set":
      return "Follow-up scheduled";
    case "follow_up_completed":
      return "Follow-up completed";
    case "reply_reason_set":
      return "Reply reason changed";
    case "note_added":
      return "Note added";
    default:
      return "Activity";
  }
}








