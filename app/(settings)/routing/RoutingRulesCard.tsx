"use client";

import useSWR from "swr";
import { useState } from "react";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

type RuleDraft = {
  match_type: "domain" | "email" | "subject_regex" | "campaign";
  match_value?: string;
  action: "assign_pool" | "assign_user";
  priority?: number;
  pool_id?: string | null;
  user_id?: string | null;
};

export default function RoutingRulesCard({ accountId }: { accountId: string }) {
  const { data, mutate } = useSWR(`/api/routing/rules?accountId=${accountId}`, (url) =>
    fetch(url).then((res) => res.json()),
  );
  const [rule, setRule] = useState<RuleDraft>({ match_type: "domain", action: "assign_pool", priority: 50 });

  async function save() {
    const response = await fetch("/api/routing/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId, ...rule }),
    });
    const payload = await response.json();
    if (!response.ok) {
      toast.error(payload.error ?? "Save failed");
      return;
    }
    toast.success("Rule saved");
    setRule((prev) => ({ ...prev, match_value: "", pool_id: null, user_id: null }));
    mutate();
  }

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>Routing Rules</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
          <Select value={rule.match_type} onValueChange={(value) => setRule((prev) => ({ ...prev, match_type: value as RuleDraft["match_type"] }))}>
            <SelectTrigger>
              <SelectValue placeholder="Match" />
            </SelectTrigger>
            <SelectContent>
              {["domain", "email", "subject_regex", "campaign"].map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="match value"
            value={rule.match_value ?? ""}
            onChange={(event) => setRule((prev) => ({ ...prev, match_value: event.target.value }))}
          />
          <Select value={rule.action} onValueChange={(value) => setRule((prev) => ({ ...prev, action: value as RuleDraft["action"] }))}>
            <SelectTrigger>
              <SelectValue placeholder="Action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="assign_pool">assign_pool</SelectItem>
              <SelectItem value="assign_user">assign_user</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder="pool_id or user_id"
            value={rule.action === "assign_pool" ? rule.pool_id ?? "" : rule.user_id ?? ""}
            onChange={(event) => {
              const value = event.target.value;
              setRule((prev) =>
                prev.action === "assign_pool"
                  ? { ...prev, pool_id: value, user_id: null }
                  : { ...prev, user_id: value, pool_id: null },
              );
            }}
          />
          <Input
            type="number"
            placeholder="priority"
            value={rule.priority ?? 50}
            onChange={(event) => setRule((prev) => ({ ...prev, priority: Number(event.target.value) }))}
          />
        </div>
        <Button onClick={save}>Add rule</Button>
        <div className="mt-3 divide-y rounded-xl border">
          {(data ?? []).map((item: any) => (
            <div key={item.id} className="flex gap-2 p-2 text-sm">
              <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-white">{item.priority}</span>
              <span>
                {item.match_type}:{item.match_value} →{" "}
                {item.action === "assign_pool" ? `pool:${item.pool_id}` : `user:${item.user_id}`}
              </span>
              {!item.active && <span className="text-xs text-muted-foreground">(inactive)</span>}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}


