"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function AcceptInvitePage() {
  const sp = useSearchParams();
  const router = useRouter();
  const token = sp.get("token") || "";
  const [status, setStatus] = useState<"idle"|"ok"|"err">("idle");
  const [msg, setMsg] = useState<string>("");

  async function accept() {
    setMsg(""); setStatus("idle");
    const res = await fetch("/api/campaigns/accept-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token })
    });
    const json = await res.json();
    if (!res.ok) {
      setStatus("err");
      setMsg(json.error || "Could not accept invite");
    } else {
      setStatus("ok");
      router.push(`/app/campaigns/${json.campaignId}`);
    }
  }

  useEffect(() => {
    if (token) accept();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">Accepting Invite…</h1>
      {status==="idle" && <p className="text-sm text-muted-foreground">Working…</p>}
      {status==="err" && <p className="text-sm text-red-600">{msg}</p>}
      {status==="ok" && <p className="text-sm text-green-600">Success! Redirecting…</p>}
      {status==="err" && <Button onClick={accept} className="mt-3">Retry</Button>}
    </div>
  );
}


