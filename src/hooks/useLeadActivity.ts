"use client";
import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export function useLeadActivity(leadId?: string) {
  const [activity, setActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClientComponentClient();

  useEffect(() => {
    if (!leadId) {
      setActivity([]);
      setLoading(false);
      return;
    }

    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("lead_activity")
        .select("*")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (!error) setActivity(data || []);
      setLoading(false);
    })();
  }, [leadId, supabase]);

  const refresh = async () => {
    if (!leadId) {
      setActivity([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from("lead_activity")
      .select("*")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (!error) setActivity(data || []);
    setLoading(false);
  };

  return { activity, loading, refresh };
}

