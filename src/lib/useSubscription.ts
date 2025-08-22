"use client";
import { useEffect, useState } from "react";
import { createClientComponentClient } from "@/lib/supabase";

export function useSubscription() {
  const supabase = createClientComponentClient();
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchStatus = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) {
            setStatus(null);
            setLoading(false);
          }
          return;
        }
        const { data, error } = await supabase
          .from("profiles")
          .select("subscription_status")
          .eq("id", user.id)
          .maybeSingle();

        if (error) {
          console.error("Subscription fetch error:", error.message);
        }
        if (!cancelled) {
          setStatus((data as any)?.subscription_status || "free");
          setLoading(false);
        }
      } catch (e: any) {
        if (!cancelled) {
          console.error("Subscription fetch error:", e?.message || e);
          setStatus("free");
          setLoading(false);
        }
      }
    };

    fetchStatus();
    return () => { cancelled = true; };
  }, [supabase]);

  return { status, loading };
}

