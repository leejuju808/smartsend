"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type Row = {
  id: string;
  email: string | null;
  domain: string | null;
  reason: string | null;
  source: string | null;
  created_at: string;
};

export function SuppressionClient({ initialRows }: { initialRows: Row[] }) {
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [email, setEmail] = useState("");
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(false);

  async function addSuppression(type: "email" | "domain") {
    setLoading(true);
    try {
      const payload =
        type === "email"
          ? { email: email.toLowerCase(), domain: null }
          : { email: null, domain: domain.toLowerCase() };

      const res = await fetch("/api/suppression/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        console.error(data.error);
        return;
      }

      setRows((prev) => [data.row, ...prev]);
      if (type === "email") setEmail("");
      else setDomain("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <p className="text-sm font-medium">Add to suppression list</p>
        <div className="grid gap-3 md:grid-cols-2 text-xs">
          <div className="space-y-1">
            <label className="text-[11px] font-semibold">Email address</label>
            <div className="flex gap-2">
              <Input
                className="h-8 text-xs"
                placeholder="example@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Button
                size="sm"
                disabled={!email || loading}
                onClick={() => addSuppression("email")}
              >
                Add
              </Button>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-semibold">Domain</label>
            <div className="flex gap-2">
              <Input
                className="h-8 text-xs"
                placeholder="company.com"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
              />
              <Button
                size="sm"
                disabled={!domain || loading}
                onClick={() => addSuppression("domain")}
              >
                Add
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <p className="text-sm font-medium">Current suppression entries</p>
        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No suppressed contacts yet. Unsubscribes and bounces will appear here automatically.
          </p>
        ) : (
          <div className="border rounded max-h-80 overflow-y-auto text-xs">
            <table className="w-full text-xs">
              <thead className="bg-muted">
                <tr>
                  <th className="p-2 text-left">Email</th>
                  <th className="p-2 text-left">Domain</th>
                  <th className="p-2 text-left">Reason</th>
                  <th className="p-2 text-left">Source</th>
                  <th className="p-2 text-left">Added</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="p-2">{r.email || "-"}</td>
                    <td className="p-2">{r.domain || "-"}</td>
                    <td className="p-2">{r.reason || "-"}</td>
                    <td className="p-2 text-[11px] text-muted-foreground">
                      {r.source || "-"}
                    </td>
                    <td className="p-2 text-[11px] text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}


































































