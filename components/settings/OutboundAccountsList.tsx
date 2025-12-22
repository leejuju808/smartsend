// components/settings/OutboundAccountsList.tsx
// Block 8160 — List of outbound_email_accounts

"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Mail, AlertTriangle, CheckCircle2 } from "lucide-react";

type OutboundAccount = {
  id: string;
  provider: string;
  display_name: string | null;
  from_email: string;
  status: "connected" | "revoked" | "error";
  daily_limit: number | null;
  used_today: number;
  created_at: string;
};

export function OutboundAccountsList({
  initialAccounts,
}: {
  initialAccounts: OutboundAccount[];
}) {
  const [accounts, setAccounts] =
    React.useState<OutboundAccount[]>(initialAccounts);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  async function refresh() {
    setIsRefreshing(true);
    try {
      const res = await fetch("/api/smartsend/outbound-accounts");
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok && Array.isArray(data.accounts)) {
        setAccounts(data.accounts);
      }
    } catch (e) {
      console.error("OutboundAccountsList refresh error:", e);
    } finally {
      setIsRefreshing(false);
    }
  }

  React.useEffect(() => {
    // simple auto-refresh when mounted (optional)
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!accounts.length && isRefreshing) {
    return (
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-sm">Senders</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-8 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!accounts.length) {
    return (
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-sm">Senders</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground">
          No senders connected yet. Add one above to start sending campaigns.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mt-4">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm">Senders</CardTitle>
        <button
          type="button"
          onClick={refresh}
          className="text-[11px] text-muted-foreground hover:underline"
        >
          {isRefreshing ? "Refreshing…" : "Refresh"}
        </button>
      </CardHeader>
      <CardContent className="space-y-3">
        {accounts.map((acc) => (
          <div
            key={acc.id}
            className="flex items-center justify-between rounded-lg border px-3 py-2 text-xs"
          >
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 opacity-70" />
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-medium">
                    {acc.display_name || acc.from_email}
                  </span>
                  <Badge variant="outline" className="uppercase">
                    {acc.provider}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  From: {acc.from_email}
                </p>
              </div>
            </div>

            <div className="flex flex-col items-end gap-1">
              <StatusBadge status={acc.status} />
              {acc.daily_limit ? (
                <p className="text-[10px] text-muted-foreground">
                  {acc.used_today}/{acc.daily_limit} sent today
                </p>
              ) : (
                <p className="text-[10px] text-muted-foreground">
                  {acc.used_today} sent today
                </p>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "connected") {
    return (
      <Badge
        variant="outline"
        className="flex items-center gap-1 border-emerald-500/60"
      >
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
        <span className="text-[11px]">Connected</span>
      </Badge>
    );
  }

  if (status === "error") {
    return (
      <Badge
        variant="outline"
        className="flex items-center gap-1 border-destructive/60"
      >
        <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
        <span className="text-[11px]">Error</span>
      </Badge>
    );
  }

  if (status === "revoked") {
    return (
      <Badge
        variant="outline"
        className="flex items-center gap-1 border-muted-foreground/60"
      >
        <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[11px]">Revoked</span>
      </Badge>
    );
  }

  return <Badge variant="outline">{status}</Badge>;
}

































































