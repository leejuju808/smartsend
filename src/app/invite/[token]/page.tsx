"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type InviteStatus = "idle" | "working" | "ok" | "err";

export default function InviteAcceptPage({ params }: { params: { token: string } }) {
  const router = useRouter();
  const [status, setStatus] = React.useState<InviteStatus>("idle");
  const [msg, setMsg] = React.useState("");

  const accept = React.useCallback(async () => {
    setStatus("working");
    const res = await fetch(`/api/invite/${params.token}/accept`, { method: "POST" });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setStatus("err");
      setMsg(json?.error ?? "Invite failed. Make sure you’re logged in with the invited email.");
      return;
    }

    setStatus("ok");
    const cid = json.campaign_id as string | undefined;
    if (cid) {
      setTimeout(() => router.replace(`/campaign/${cid}`), 600);
    }
  }, [params.token, router]);

  React.useEffect(() => {
    accept();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="max-w-md mx-auto py-16 text-center space-y-3">
      <h1 className="text-xl font-semibold">Joining campaign…</h1>
      {status === "working" && <div>Checking your invite and account…</div>}
      {status === "ok" && <div className="text-emerald-400">Success! Redirecting…</div>}
      {status === "err" && (
        <div className="space-y-3">
          <div className="text-red-400">{msg}</div>
          <Button onClick={accept}>Try again</Button>
          <div className="text-sm text-muted-foreground">
            Tip: sign in with the invited email first.
          </div>
        </div>
      )}
    </div>
  );
}



