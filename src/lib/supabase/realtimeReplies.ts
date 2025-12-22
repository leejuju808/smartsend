import { supabase } from "@/lib/supabaseClient";

export function subscribeToReplies(userId: string, callback: (newReply: any) => void) {
  return supabase
    .channel("replies-channel")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "replies",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        callback(payload.new);
      }
    )
    .subscribe();
}

