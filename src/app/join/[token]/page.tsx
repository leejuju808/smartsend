"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export default function JoinPage({ params }: { params: { token: string } }) {
  const router = useRouter();
  const [msg, setMsg] = React.useState<string | null>(null);

  async function accept() {
    const r = await fetch(`/api/join/${params.token}`, { method: "POST" });
    const j = await r.json().catch(() => ({}));
    if (r.ok) {
      setMsg("Joined! Redirecting…");
      setTimeout(() => router.push("/"), 1200);
    } else setMsg(j?.error ?? "Invite failed");
  }

  return (
    <div className="mx-auto mt-24 max-w-md rounded-xl border p-6">
      <h1 className="mb-2 text-xl font-semibold">Accept Invitation</h1>
      <p className="mb-4 text-sm text-muted-foreground">You’ll be added to the campaign once you confirm.</p>
      <Button onClick={accept}>Accept Invitation</Button>
      {msg && <div className="mt-3 text-sm">{msg}</div>}
    </div>
  );
}

