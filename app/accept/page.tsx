"use client";
import * as React from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function AcceptInvitePage() {
  const sp = useSearchParams();
  const router = useRouter();
  const token = sp.get("token");

  async function accept() {
    try {
      const r = await fetch("/api/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (r.ok) {
        toast.success("Joined campaign");
        router.push("/");
      } else {
        const data = await r.json().catch(() => ({}));
        toast.error(data?.error ?? "Invalid or expired invite");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invalid or expired invite");
    }
  }

  return (
    <div className="mx-auto max-w-md p-6 space-y-4">
      <h1 className="text-xl font-semibold">Accept Invite</h1>
      <p>Click below to join this campaign with your account.</p>
      <Button onClick={accept} disabled={!token}>
        Accept Invite
      </Button>
    </div>
  );
}
