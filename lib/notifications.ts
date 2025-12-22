import { createClient } from "@/lib/supabase/server";

type NotificationType = "reply" | "meeting" | "billing" | "system";

export async function createNotification(args: {
  workspaceId: string;
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  data?: any;
}) {
  const supabase = createClient();

  const { error } = await supabase.from("notifications").insert({
    workspace_id: args.workspaceId,
    user_id: args.userId,
    type: args.type,
    title: args.title,
    body: args.body ?? null,
    data: args.data ?? null,
  });

  if (error) {
    console.error("Failed to create notification", error);
  }
}
