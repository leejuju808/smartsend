"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/button";

export default function AcceptInvitePage() {
  const token = useSearchParams().get("token");
  const router = useRouter();
  const [status, setStatus] = useState<"idle"|"ok"|"err">("idle");

  async function accept() {
    const res = await fetch("/api/invites/accept", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    setStatus(res.ok ? "ok" : "err");
    if (res.ok) {
      const j = await res.json();
      setTimeout(()=>router.push(`/campaigns/${j.campaign_id}`), 800);
    }
  }

  useEffect(() => { if (token) accept(); }, [token]); // eslint-disable-line

  return (
    <div className="p-6 flex justify-center">
      <Card className="w-full max-w-md">
        <CardHeader><CardTitle>Accepting invite…</CardTitle></CardHeader>
        <CardContent>
          {status === "idle" && <div>Verifying…</div>}
          {status === "ok" && <div className="text-green-600">Success! Redirecting…</div>}
          {status === "err" && (
            <div className="space-y-3">
              <div className="text-red-600">Invite invalid or expired.</div>
              <Button onClick={()=>location.assign("/")}>Go home</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

