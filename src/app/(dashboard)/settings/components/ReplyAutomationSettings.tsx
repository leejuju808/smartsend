"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/src/components/ui/Card";
import { Switch } from "@/src/components/ui/switch";
import { Badge } from "@/src/components/ui/badge";

type Rule = {
  id: string;
  name: string;
  ai_category: string | null;
  action: string;
  is_enabled: boolean;
};

interface ReplyAutomationSettingsProps {
  canEdit: boolean;
}

export default function ReplyAutomationSettings({ canEdit }: ReplyAutomationSettingsProps) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/reply-automation/rules");
      const json = await res.json();
      if (res.ok) {
        setRules(json.rules || []);
      }
    } catch (error) {
      console.error("Failed to load rules:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const toggle = async (rule: Rule, value: boolean) => {
    if (!canEdit) return;

    // Optimistic update
    setRules((prev) =>
      prev.map((r) =>
        r.id === rule.id ? { ...r, is_enabled: value } : r
      )
    );

    try {
      const res = await fetch(`/api/reply-automation/rules/${rule.id}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isEnabled: value }),
      });

      if (!res.ok) {
        // Revert on error
        setRules((prev) =>
          prev.map((r) =>
            r.id === rule.id ? { ...r, is_enabled: !value } : r
          )
        );
        const error = await res.json();
        console.error("Failed to toggle rule:", error);
      }
    } catch (error) {
      // Revert on error
      setRules((prev) =>
        prev.map((r) =>
          r.id === rule.id ? { ...r, is_enabled: !value } : r
        )
      );
      console.error("Failed to toggle rule:", error);
    }
  };

  const categoryLabel = (c: string | null) => {
    if (!c) return "Any category";
    if (c === "not_interested") return "Not interested";
    if (c === "bounce") return "Bounce";
    if (c === "out_of_office") return "Out of office";
    if (c === "interested") return "Interested";
    if (c === "neutral") return "Neutral";
    if (c === "unsubscribe") return "Unsubscribe";
    return c;
  };

  const actionLabel = (a: string) => {
    if (a === "opt_out") return "Stop sequence + opt-out lead";
    if (a === "mark_bounced") return "Stop sequence + mark bounced";
    if (a === "stop_sequence") return "Stop automatic followups";
    return a;
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Reply automation</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        <p className="text-[11px] text-muted-foreground">
          Use AI reply categories to automatically stop sequences, opt-out leads, or mark bounces.
        </p>

        {loading ? (
          <p className="text-[11px] text-muted-foreground">Loading rules…</p>
        ) : rules.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No rules defined yet.</p>
        ) : (
          <div className="space-y-2">
            {rules.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between border rounded-md px-3 py-2 bg-slate-950/60"
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[11px]">{r.name}</span>
                    <Badge className="text-[10px]">{categoryLabel(r.ai_category)}</Badge>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {actionLabel(r.action)}
                  </span>
                </div>
                <Switch
                  checked={r.is_enabled}
                  onCheckedChange={(val) => toggle(r, val)}
                  disabled={!canEdit}
                />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}







