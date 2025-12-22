"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function Join() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  React.useEffect(() => {
    (async () => {
      if (!token) {
        router.replace("/");
        return;
      }
      const response = await fetch("/api/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const payload = await response.json().catch(() => ({}));
      if (payload?.ok) {
        router.replace("/");
      } else {
        router.replace("/?join=failed");
      }
    })();
  }, [router, token]);

  return (
    <div className="grid h-screen place-items-center text-sm text-muted-foreground">
      Joining…
    </div>
  );
}





