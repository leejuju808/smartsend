import { useEffect } from "react";
import { createClientComponentClient } from "@supabase/ssr";

export function useBillingEventsRealtime(onEvent: (event: any) => void) {
  useEffect(() => {
    const supabase = createClientComponentClient();

    const channel = supabase
      .channel("billing-events")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "billing_events" },
        (payload) => onEvent(payload.new)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [onEvent]);
}








