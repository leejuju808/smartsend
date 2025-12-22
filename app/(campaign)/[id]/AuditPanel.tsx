"use client";

import * as React from "react";
import useSWR from "swr";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ActivityRow = {
  id: string;
  created_at: string;
  account_id: string | null;
  campaign_id: string | null;
  actor_user_id: string | null;
  actor_role: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_name: string | null;
  details: Record<string, unknown>;
};

const ACTIONS = [
  "",
  "create",
  "update",
  "delete",
  "merge",
  "send",
  "schedule",
  "cancel",
  "retry",
  "invite",
  "accept",
  "role_change",
  "pause",
  "resume",
  "suppress",
  "unsuppress",
] as const;

const ENTITY_TYPES = [
  "",
  "lead",
  "thread",
  "message",
  "campaign",
  "sequence",
  "task",
  "billing",
  "settings",
  "member",
] as const;

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function AuditPanel({ campaignId }: { campaignId: string }) {
  const params = useSearchParams();
  const router = useRouter();

  const setParam = React.useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params.toString());
      if (value) {
        next.set(key, value);
      } else {
        next.delete(key);
      }
      router.replace(`?${next.toString()}`);
    },
    [params, router],
  );

  const queryString = React.useMemo(() => {
    const next = new URLSearchParams();
    next.set("campaignId", campaignId);
    const action = params.get("action");
    const entityType = params.get("entityType");
    const userId = params.get("userId");
    if (action) next.set("action", action);
    if (entityType) next.set("entityType", entityType);
    if (userId) next.set("userId", userId);
    return next.toString();
  }, [campaignId, params]);

  const apiUrl = React.useMemo(() => `/api/audit?${queryString}`, [queryString]);
  const exportUrl = React.useMemo(
    () => `/api/audit/export?${queryString}`,
    [queryString],
  );

  const { data } = useSWR<ActivityRow[]>(apiUrl, fetcher);
  const rows = data ?? [];

  const userOptions = React.useMemo(() => {
    const unique = new Set<string>();
    rows.forEach((row) => {
      if (row.actor_user_id) unique.add(row.actor_user_id);
    });
    return Array.from(unique);
  }, [rows]);

  return (
    <Card className="rounded-2xl">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Activity Log</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={params.get("action") ?? ""}
            onValueChange={(value) => setParam("action", value)}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Action" />
            </SelectTrigger>
            <SelectContent>
              {ACTIONS.map((action) => (
                <SelectItem key={action || "any"} value={action}>
                  {action || "Any action"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={params.get("entityType") ?? ""}
            onValueChange={(value) => setParam("entityType", value)}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Entity" />
            </SelectTrigger>
            <SelectContent>
              {ENTITY_TYPES.map((entity) => (
                <SelectItem key={entity || "any"} value={entity}>
                  {entity || "Any entity"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {userOptions.length > 0 && (
            <Select
              value={params.get("userId") ?? ""}
              onValueChange={(value) => setParam("userId", value)}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Actor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Any actor</SelectItem>
                {userOptions.map((userId) => (
                  <SelectItem key={userId} value={userId}>
                    {userId.slice(0, 8)}…{userId.slice(-4)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Button
            variant="secondary"
            onClick={() => window.open(exportUrl, "_blank", "noopener")}
          >
            Export CSV
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        <div className="divide-y rounded-xl border">
          {rows.map((row) => (
            <details key={row.id} className="group p-3">
              <summary className="flex cursor-pointer items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    {new Date(row.created_at).toLocaleString()}
                  </span>
                  <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-white capitalize">
                    {row.action}
                  </span>
                  <span className="text-sm">{row.entity_type}</span>
                  {row.entity_name && (
                    <span className="text-sm text-muted-foreground">
                      • {row.entity_name}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  by {row.actor_user_id ? `${row.actor_user_id.slice(0, 8)}…` : "system"} (
                  {row.actor_role ?? "n/a"})
                </div>
              </summary>
              <pre className="mt-2 whitespace-pre-wrap break-words text-xs">
                {JSON.stringify(row.details ?? {}, null, 2)}
              </pre>
            </details>
          ))}

          {rows.length === 0 && (
            <div className="p-6 text-sm text-muted-foreground">
              No activity yet.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}




