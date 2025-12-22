"use client";

import { useEffect } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useToast } from "@/components/ui/toast/ToastProvider";
import { useReplyModal } from "./useReplyModal";

export function useNotifications(userId?: string) {
  const supabase = createClientComponentClient();
  const { push: toast } = useToast();
  const { openWith } = useReplyModal();

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel("notifications-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        async (payload: any) => {
          const n = payload.new as {
            id: string;
            title: string;
            body?: string;
            campaign_id: string;
            lead_id: string;
          };

          toast({
            title: n.title,
            description: n.body ?? "Open to view reply",
            type: "info",
            duration: 10000,
          });

          // Auto-open modal (optional: you could make this a click action instead)
          try {
            const { data: lead } = await supabase
              .from("leads")
              .select("id, email, first_name, last_name, reply_text, replied_at, campaign_id")
              .eq("id", n.lead_id)
              .single();

            if (lead) {
              openWith({
                id: lead.id,
                lead_email: lead.email,
                lead_name: [lead.first_name, lead.last_name].filter(Boolean).join(" ") || null,
                reply_text: null,
                replied_at: lead.replied_at,
                thread_id: null,
                campaign_id: lead.campaign_id,
              });
            }
          } catch (error) {
            console.error("Error fetching lead for notification:", error);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, supabase, toast, openWith]);
}

