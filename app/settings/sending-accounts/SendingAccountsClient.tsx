"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

type SendingAccount = {
  id: string;
  provider: string;
  from_email: string;
  from_name: string | null;
  status: string;
  daily_limit: number;
  sent_today: number;
};

export function SendingAccountsClient({
  initialAccounts,
}: {
  initialAccounts: SendingAccount[];
}) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);

  async function connect(provider: "gmail" | "outlook") {
    setLoadingProvider(provider);
    try {
      const res = await fetch(`/api/auth/${provider}/connect`);
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } finally {
      setLoadingProvider(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-2">
        <p className="text-sm font-medium">Connect a new sending account</p>
        <div className="flex gap-2 text-xs">
          <Button
            size="sm"
            variant="outline"
            onClick={() => connect("gmail")}
            disabled={loadingProvider === "gmail"}
          >
            {loadingProvider === "gmail" ? "Connecting..." : "Connect Gmail"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => connect("outlook")}
            disabled={loadingProvider === "outlook"}
          >
            {loadingProvider === "outlook" ? "Connecting..." : "Connect Outlook"}
          </Button>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <p className="text-sm font-medium">Connected accounts</p>
        {accounts.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No sending accounts yet. Connect at least one Gmail or Outlook account to start sending.
          </p>
        ) : (
          <div className="border rounded max-h-80 overflow-y-auto text-xs">
            <table className="w-full text-xs">
              <thead className="bg-muted">
                <tr>
                  <th className="p-2 text-left">From</th>
                  <th className="p-2 text-left">Provider</th>
                  <th className="p-2 text-left">Status</th>
                  <th className="p-2 text-left">Today</th>
                  <th className="p-2 text-left">Daily limit</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id} className="border-t">
                    <td className="p-2">
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {a.from_name || a.from_email}
                        </span>
                        {a.from_name && (
                          <span className="text-[11px] text-muted-foreground">
                            {a.from_email}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-2 capitalize">{a.provider}</td>
                    <td className="p-2 text-[11px]">
                      {a.status === "connected" && (
                        <span className="text-green-600 font-medium">Connected</span>
                      )}
                      {a.status === "throttled" && (
                        <span className="text-yellow-700 font-medium">
                          Throttled (limit reached)
                        </span>
                      )}
                      {a.status === "error" && (
                        <span className="text-red-600 font-medium">Error</span>
                      )}
                      {!["connected", "throttled", "error"].includes(a.status) && (
                        <span className="text-slate-500">{a.status}</span>
                      )}
                    </td>
                    <td className="p-2 text-[11px]">
                      {a.sent_today} / {a.daily_limit}
                    </td>
                    <td className="p-2 text-[11px]">{a.daily_limit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {accounts.length > 0 && (
          <p className="text-[11px] text-muted-foreground mt-2">
            Accounts marked as "Throttled" have hit their daily send cap and will resume automatically tomorrow.
          </p>
        )}
      </Card>
    </div>
  );
}

