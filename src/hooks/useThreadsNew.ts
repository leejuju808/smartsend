"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@/lib/supabase";

export type Thread = {
  id: string;
  lead_email: string;
  subject: string | null;
  last_message_at: string;
  status: "open" | "replied" | "archived";
};

export function useThreadsNew(search?: string) {
  const supabase = createClientComponentClient();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      setLoading(true);
      let q = supabase
        .from("threads_new")
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
      .channel("threads-new-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "threads_new" },
        () => load()
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [search, supabase]);

  return { threads, loading };
}

