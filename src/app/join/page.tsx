"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { supabaseBrowser } from "@/lib/supabase-browser";

export default function JoinPage() {
  const token = useSearchParams().get("token");
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState<string>("");
  const sb = useMemo(supabaseBrowser, []);

  useEffect(() => {
    async function accept() {
      if (!token) {
        setMessage("Missing token.");
        setStatus("error");
        return;
      }
      setStatus("loading");

       const session = await sb.auth.getSession();
       const accessToken = session.data.session?.access_token;
       if (!accessToken) {
         setStatus("error");
         setMessage("You must be signed in.");
         return;
       }

      const res = await fetch("/functions/v1/campaign-invite-accept", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ token }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        setStatus("done");
        setMessage("Joined! Redirecting…");
        setTimeout(() => {
          router.push(`/campaigns/${j.campaign_id}/inbox`);
        }, 1000);
      } else {
        setStatus("error");
        setMessage((j as { error?: string })?.error ?? "Invite invalid or expired.");
      }
    }
    void accept();
  }, [token, router]);

  return (
    <div className="min-h-[60vh] grid place-items-center">
      <div className="p-6 rounded-2xl border">
        <h1 className="text-xl font-semibold mb-2">Join Campaign</h1>
        <p className="text-sm text-muted-foreground mb-4">
          {status === "loading" ? "Accepting invite…" : message || "Ready to join."}
        </p>
        <Button onClick={() => location.reload()} disabled={status === "loading"}>
          Retry
        </Button>
      </div>
    </div>
  );
}
