"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function useSB() {
  return useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      ),
    [],
  );
}

export default function AcceptInvite() {
  const sb = useSB();
  const qp = useSearchParams();
  const token = qp.get("token") || "";
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function accept() {
    const { data: s } = await sb.auth.getSession();
    const uid = s?.session?.user?.id;
    if (!uid) {
      setErr("Please sign in first.");
      return;
    }
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL}/team-invite-accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, accept_user_id: uid }),
    });
    const j = await res.json();
    if (!j.ok) {
      setErr(j.error || "Failed to accept invite");
    } else {
      setDone(true);
    }
  }

  useEffect(() => {
    if (token) {
      accept();
    } else {
      setErr("Missing invite token.");
    }
  }, [token]);

  return (
    <div className="p-6">
      <Card>
        <CardHeader>
          <CardTitle>Accepting Invite…</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {done ? (
            <div>Invite accepted! You now have access to the owner's campaigns.</div>
          ) : (
            <div>{err || "Working…"}</div>
          )}
          {!done && (
            <Button onClick={accept} disabled={!token}>
              Try Again
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}