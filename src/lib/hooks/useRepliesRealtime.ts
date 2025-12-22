"use client";

import { useEffect, useRef } from "react";

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

type Updater = (evt: { type: "insert" | "update" | "delete"; table: "emails" | "replies"; row: any }) => void;

export function useRepliesRealtime(userId: string | null, onChange: Updater) {
  const supabase = createClientComponentClient();
  const onChangeRef = useRef(onChange);
  
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!userId) return;

    const emailsChannel = supabase
      .channel(`emails-realtime-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "emails", filter: `user_id=eq.${userId}` },
        (payload) => onChangeRef.current({ type: payload.eventType.toLowerCase() as any, table: "emails", row: payload.new ?? payload.old })
      )
      .subscribe();

    const repliesChannel = supabase
      .channel(`replies-realtime-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "replies", filter: `user_id=eq.${userId}` },
        (payload) => onChangeRef.current({ type: payload.eventType.toLowerCase() as any, table: "replies", row: payload.new ?? payload.old })
      )
      .subscribe();

    return () => {
      supabase.removeChannel(emailsChannel);
      supabase.removeChannel(repliesChannel);
    };
  }, [userId, supabase]);
}

