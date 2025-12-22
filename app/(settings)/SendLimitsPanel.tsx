"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/Button";
import { toast } from "sonner";

type LimitRow = {
  account_id: string;
  email: string;
  provider: string;
  daily_cap: number;
  hourly_cap: number;
  warmup_enabled: boolean;
  warmup_day: number;
  timezone: string;
};

export default function SendLimitsPanel() {
  const [rows, setRows] = React.useState<LimitRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [savingId, setSavingId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const response = await fetch("/api/sends/usage", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(await response.text());
      }

      const payload = await response.json();
      if (!Array.isArray(payload?.accounts)) {
        setRows([]);
        return;
      }

      setRows(
        payload.accounts.map((row: any) => ({
          account_id: row.account_id,
          email: row.email ?? "",
          provider: row.provider ?? "gmail",
          daily_cap: Number(row.cap_24h ?? 150),
          hourly_cap: Number(row.cap_1h ?? 30),
          warmup_enabled: Boolean(
            row.warmup_enabled ?? true
          ),
          warmup_day: Math.max(1, Number(row.warmup_day ?? 1)),
          timezone: row.timezone ?? "America/Los_Angeles",
        }))
      );
    } catch (error) {
      console.error("[SendLimitsPanel] Failed to load usage", error);
      toast.error("Failed to load send limits");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const updateRow = React.useCallback((accountId: string, patch: Partial<LimitRow>) => {
    setRows((prev) =>
      prev.map((row) => (row.account_id === accountId ? { ...row, ...patch } : row))
    );
  }, []);

  const save = React.useCallback(
    async (row: LimitRow) => {
      setSavingId(row.account_id);
      try {
        const response = await fetch("/api/sends/limits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            account_id: row.account_id,
            provider: row.provider,
            daily_cap: row.daily_cap,
            hourly_cap: row.hourly_cap,
            warmup_enabled: row.warmup_enabled,
            warmup_day: row.warmup_enabled ? row.warmup_day : 1,
            timezone: row.timezone,
          }),
        });

        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || "Save failed");
        }

        toast.success("Send limits saved");
        await load();
      } catch (error: any) {
        console.error("[SendLimitsPanel] Failed to save limits", error);
        toast.error(error?.message ?? "Failed to save");
      } finally {
        setSavingId(null);
      }
    },
    [load]
  );

  if (loading) {
    return (
      <Card className="rounded-2xl">
        <CardContent className="p-6 text-sm text-muted-foreground">
          Loading send limits…
        </CardContent>
      </Card>
    );
  }

  if (!rows.length) {
    return null;
  }

  return (
    <Card className="rounded-2xl">
      <CardContent className="p-6 space-y-4">
        <h3 className="text-lg font-semibold">Send Guard Settings</h3>
        <div className="grid gap-4">
          {rows.map((row) => (
            <div
              key={row.account_id}
              className="grid grid-cols-1 gap-3 md:grid-cols-6 items-end border rounded-xl p-3"
            >
              <div className="md:col-span-2 text-sm">
                <div className="font-medium">{row.email}</div>
                <div className="opacity-70">{row.provider}</div>
              </div>

              <div>
                <label className="text-xs">Daily cap</label>
                <Input
                  type="number"
                  value={row.daily_cap}
                  onChange={(event) =>
                    updateRow(row.account_id, {
                      daily_cap: Number.isFinite(Number(event.target.value))
                        ? Number(event.target.value)
                        : row.daily_cap,
                    })
                  }
                />
              </div>

              <div>
                <label className="text-xs">Hourly cap</label>
                <Input
                  type="number"
                  value={row.hourly_cap}
                  onChange={(event) =>
                    updateRow(row.account_id, {
                      hourly_cap: Number.isFinite(Number(event.target.value))
                        ? Number(event.target.value)
                        : row.hourly_cap,
                    })
                  }
                />
              </div>

              <div className="flex items-center justify-between border rounded-lg p-2">
                <div className="text-sm">Warm-up</div>
                <Switch
                  checked={row.warmup_enabled}
                  onCheckedChange={(checked) =>
                    updateRow(row.account_id, { warmup_enabled: checked })
                  }
                />
              </div>

              <div>
                <label className="text-xs">Warm-up day</label>
                <Input
                  type="number"
                  value={row.warmup_day}
                  min={1}
                  max={365}
                  onChange={(event) =>
                    updateRow(row.account_id, {
                      warmup_day: Math.min(
                        365,
                        Math.max(
                          1,
                          Number.isFinite(Number(event.target.value))
                            ? Number(event.target.value)
                            : row.warmup_day
                        )
                      ),
                    })
                  }
                  disabled={!row.warmup_enabled}
                />
              </div>

              <div className="md:col-span-6 flex justify-end">
                <Button
                  size="sm"
                  onClick={() => save(row)}
                  disabled={savingId === row.account_id}
                >
                  {savingId === row.account_id ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}


