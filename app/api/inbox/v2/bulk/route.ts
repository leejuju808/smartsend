// Block 13300 — SmartSend Inbox v2 API
// POST /api/inbox/v2/bulk
// Bulk actions on threads (mark read/unread, update status, suppress, add tag)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { thread_ids, action, value } = await req.json();

  if (!thread_ids || !Array.isArray(thread_ids) || thread_ids.length === 0) {
    return NextResponse.json(
      { error: "thread_ids array required" },
      { status: 400 }
    );
  }

  if (!action) {
    return NextResponse.json(
      { error: "action required (mark_read, mark_unread, update_status, suppress, add_tag)" },
      { status: 400 }
    );
  }

  let updateData: any = {
    updated_at: new Date().toISOString(),
  };

  switch (action) {
    case "mark_read":
      updateData.unread_count = 0;
      break;
    case "mark_unread":
      updateData.unread_count = 1;
      break;
    case "update_status":
      if (!value || !["open", "snoozed", "closed"].includes(value)) {
        return NextResponse.json(
          { error: "Invalid status value" },
          { status: 400 }
        );
      }
      updateData.status = value;
      break;
    case "suppress":
      updateData.suppressed = value !== false; // default to true if not specified
      break;
    case "update_intent":
      if (!value || !["HOT", "WARM", "FOLLOW_UP", "NOT_INTERESTED", "NEW_REPLY", "UNCLASSIFIED"].includes(value)) {
        return NextResponse.json(
          { error: "Invalid intent value" },
          { status: 400 }
        );
      }
      updateData.latest_intent = value;
      break;
    default:
      return NextResponse.json(
        { error: "Invalid action" },
        { status: 400 }
      );
  }

  const { error } = await supabase
    .from("reply_threads")
    .update(updateData)
    .in("id", thread_ids);

  if (error) {
    console.error("Bulk action error:", error);
    return NextResponse.json({ error: "Failed to perform bulk action" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    count: thread_ids.length,
    action,
  });
}





















































