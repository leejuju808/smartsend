"use client";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function AcceptInvitePage() {
  const sp = useSearchParams();
  const [state, setState] = useState<"loading"|"ok"|"error">("loading");
  const token = sp.get("token");

  useEffect(() => {
    if (!token) {
      setState("error");
      return;
    }

    (async () => {
      try {
        const r = await fetch("/api/team/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token })
        });
        setState(r.ok ? "ok" : "error");
        if (r.ok) setTimeout(() => (window.location.href = "/dashboard"), 1000);
      } catch { setState("error"); }
    })();
  }, [token]);

  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <div className="border rounded p-6 text-center">
        {state === "loading" && <p>Joining team…</p>}
        {state === "ok" && <p>✅ Joined! Redirecting…</p>}
        {state === "error" && <p className="text-red-600">Invite invalid or expired.</p>}
      </div>
    </div>
  );
} 