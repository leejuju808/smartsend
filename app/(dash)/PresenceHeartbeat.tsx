"use client";

import * as React from "react";

export function PresenceHeartbeat() {
  React.useEffect(() => {
    let mounted = true;
    const ping = () => {
      if (!mounted) return;
      fetch("/api/presence/heartbeat", { method: "POST" }).catch(() => undefined);
    };

    ping();
    const id = setInterval(ping, 30_000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  return null;
}



