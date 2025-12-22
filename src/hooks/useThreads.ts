"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export type Thread = {
  id: string;
  lead_email: string;
  subject: string | null;
  last_message_at: string;
  status: "open" | "replied" | "archived";
};

export function useThreads(search?: string) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      setLoading(true);
      let q = supabase
        .from("threads")
        .select("id, lead_email, subject, last_message_at, status")
        .order("last_message_at", { ascending: false });

      if (search) q = q.ilike("lead_email", `%${search}%`);

      const { data, error } = await q;
      if (!isMounted) return;
      if (error) console.error(error);
      setThreads((data as Thread[]) || []);
      setLoading(false);
    };
    load();

    // live updates on new messages bumping last_message_at
    const channel = supabase
      .channel("threads-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "threads" },
        () => load()
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [search]);

  return { threads, loading };
}
