"use client";

import * as React from "react";
import useSWR from "swr";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const ISP = ["gmail", "outlook", "yahoo", "zoho", "other"] as const;

type QuietHours = {
  enabled?: boolean;
  start?: string;
  end?: string;
};

type OverrideRow = {
  isp_key: string;
  enabled: boolean;
  start_hhmm: string;
  end_hhmm: string;
};

type QuietPayload = {
  account: { id: string; timezone?: string | null; quiet_hours?: QuietHours | null } | null;
  isp_overrides: OverrideRow[];
};

export default function QuietHoursCard({ accountId }: { accountId: string }) {
  const { data, mutate } = useSWR<QuietPayload>(
    accountId ? `/api/account/quiet?account=${accountId}` : null,
    (url) => fetch(url).then((r) => r.json()),
  );

  const baseQuiet = data?.account?.quiet_hours ?? { enabled: true, start: "20:00", end: "07:00" };
  const [tz, setTz] = React.useState<string>(data?.account?.timezone ?? "America/Los_Angeles");
  const [enabled, setEnabled] = React.useState<boolean>(!!baseQuiet.enabled);
  const [start, setStart] = React.useState<string>(baseQuiet.start ?? "20:00");
  const [end, setEnd] = React.useState<string>(baseQuiet.end ?? "07:00");
  const [overrides, setOverrides] = React.useState<Record<string, OverrideRow>>(() => {
    const map: Record<string, OverrideRow> = {};
    for (const row of data?.isp_overrides ?? []) {
      map[row.isp_key] = row;
    }
    for (const isp of ISP) {
      map[isp] ||= {
        isp_key: isp,
        enabled: false,
        start_hhmm: start,
        end_hhmm: end,
      };
    }
    return map;
  });

  React.useEffect(() => {
    if (!data) return;
    const newTz = data.account?.timezone ?? "America/Los_Angeles";
    const newBase = data.account?.quiet_hours ?? { enabled: true, start: "20:00", end: "07:00" };
    setTz(newTz);
    setEnabled(!!newBase.enabled);
    setStart(newBase.start ?? "20:00");
    setEnd(newBase.end ?? "07:00");

    setOverrides((prev) => {
      const map: Record<string, OverrideRow> = {};
      for (const row of data.isp_overrides ?? []) {
        map[row.isp_key] = row;
      }
      for (const isp of ISP) {
        map[isp] ||= {
          isp_key: isp,
          enabled: false,
          start_hhmm: newBase.start ?? "20:00",
          end_hhmm: newBase.end ?? "07:00",
        };
      }
      return map;
    });
  }, [data]);

  async function save() {
    await fetch("/api/account/quiet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        account_id: accountId,
        timezone: tz,
        quiet_hours: { enabled, start, end },
        isp_overrides: Object.values(overrides),
      }),
    });
    mutate();
  }

  function updateOverride(isp: string, patch: Partial<OverrideRow>) {
    setOverrides((prev) => ({
      ...prev,
      [isp]: {
        ...prev[isp],
        ...patch,
        isp_key: isp,
      },
    }));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quiet Hours &amp; Timezone</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label className="text-xs uppercase tracking-wide">Timezone (IANA)</Label>
            <Input
              value={tz}
              onChange={(event) => setTz(event.target.value)}
              placeholder="America/Los_Angeles"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs uppercase tracking-wide">Start (HH:MM)</Label>
            <Input value={start} onChange={(event) => setStart(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs uppercase tracking-wide">End (HH:MM)</Label>
            <Input value={end} onChange={(event) => setEnd(event.target.value)} />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Switch checked={enabled} onCheckedChange={setEnabled} id="quiet-enabled-toggle" />
          <Label htmlFor="quiet-enabled-toggle" className="text-sm">
            Enable base quiet hours
          </Label>
        </div>

        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wide opacity-70">Per-ISP overrides</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {ISP.map((isp) => {
              const row = overrides[isp];
              return (
                <div key={isp} className="rounded-lg border p-3 space-y-2">
                  <div className="text-xs font-semibold uppercase">{isp}</div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={!!row?.enabled}
                      onCheckedChange={(value) => updateOverride(isp, { enabled: value })}
                      id={`override-${isp}-enabled`}
                    />
                    <Label htmlFor={`override-${isp}-enabled`} className="text-xs">
                      enabled
                    </Label>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      value={row?.start_hhmm ?? ""}
                      onChange={(event) => updateOverride(isp, { start_hhmm: event.target.value })}
                      placeholder="20:00"
                    />
                    <Input
                      value={row?.end_hhmm ?? ""}
                      onChange={(event) => updateOverride(isp, { end_hhmm: event.target.value })}
                      placeholder="07:00"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Button size="sm" onClick={save} disabled={!accountId}>
            Save
          </Button>
          <span className="text-xs opacity-70">
            Scheduler pauses sends during quiet windows using your local timezone or ISP override.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

