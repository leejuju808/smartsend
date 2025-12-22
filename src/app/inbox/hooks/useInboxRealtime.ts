"use client";

import { useEffect, useRef } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

interface UseInboxRealtimeProps {
  onNewMessage: (message: any) => void;
}

export function useInboxRealtime({ onNewMessage }: UseInboxRealtimeProps) {
  const supabase = createClientComponentClient();
  const onNewMessageRef = useRef(onNewMessage);

  useEffect(() => {
    onNewMessageRef.current = onNewMessage;
  }, [onNewMessage]);

  useEffect(() => {
    // Subscribe to new inbox_messages
    const channel = supabase
      .channel("inbox-messages-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "inbox_messages",
        },
        (payload) => {
          const newMessage = payload.new;
          
          // Only trigger for Hot/Warm intents
          if (
            newMessage.ai_intent === "hot" ||
            newMessage.ai_intent === "warm"
          ) {
            onNewMessageRef.current(newMessage);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);
}



















































