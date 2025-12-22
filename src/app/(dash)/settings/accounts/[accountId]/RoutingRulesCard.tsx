"use client";

import * as React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

type Rule = {
  id?: string;
  to_email?: string;
  to_domain?: string;
  plus_tag?: string;
  campaign_id: string;
  priority: number;
  enabled: boolean;
};

export function RoutingRulesCard({
  accountId,
  campaigns,
}: {
  accountId: string;
  campaigns: { id: string; name: string }[];
}) {
  const [rules, setRules] = React.useState<Rule[]>([]);
  const [defaultCampaign, setDefaultCampaign] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/account/${accountId}/routing`);
        const json = await res.json();
        setRules(json.rules ?? []);
        setDefaultCampaign(json.default_campaign_id ?? null);
      } catch (e) {
        console.error("Routing fetch failed", e);
        toast.error("Failed to load routing rules");
      } finally {
        setLoading(false);
      }
    })();
  }, [accountId]);

  function addRow() {
    setRules((r) => [
      ...r,
      {
        to_email: "",
        to_domain: "",
        plus_tag: "",
        campaign_id: campaigns[0]?.id ?? "",
        priority: 100,
        enabled: true,
      },
    ]);
  }
  function removeRow(index: number) {
    setRules((rows) => rows.filter((_, idx) => idx !== index));
  }
  function setRule(index: number, key: keyof Rule, value: any) {
    setRules((rows) => rows.map((row, idx) => (idx === index ? { ...row, [key]: value } : row)));
  }

  async function save() {
    setLoading(true);
    const clean = rules.map((r) => ({
      to_email: r.to_email ? r.to_email.trim() || undefined : undefined,
      to_domain: r.to_domain ? r.to_domain.trim() || undefined : undefined,
      plus_tag: r.plus_tag ? r.plus_tag.trim() || undefined : undefined,
      campaign_id: r.campaign_id,
      priority: Number(r.priority) || 100,
      enabled: Boolean(r.enabled),
    }));
    try {
      const res = await fetch(`/api/account/${accountId}/routing`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rules: clean }),
      });
      if (!res.ok) {
        toast.error("Save failed");
      } else {
        toast.success("Routing saved");
      }
    } catch (e) {
      console.error("Routing save failed", e);
      toast.error("Save failed");
    } finally {
      setLoading(false);
    }
  }

  async function saveDefault() {
    try {
      const res = await fetch(`/api/account/${accountId}/routing/default`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ campaign_id: defaultCampaign }),
      });
      if (!res.ok) throw new Error();
      toast.success("Default set");
    } catch (e) {
      console.error("Default campaign save failed", e);
      toast.error("Failed to set default");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Inbound Routing</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border p-3">
          <Label>Default Campaign (fallback)</Label>
          <div className="mt-2 flex gap-2">
            <select
              className="w-full rounded-md border bg-background p-2 text-sm"
              value={defaultCampaign ?? ""}
              onChange={(e) => setDefaultCampaign(e.target.value || null)}
              disabled={loading}
            >
              <option value="">(none)</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <Button variant="outline" onClick={saveDefault} disabled={loading}>
              Save
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-2 py-2 text-left">Priority</th>
                <th className="px-2 py-2 text-left">To Email</th>
                <th className="px-2 py-2 text-left">Domain</th>
                <th className="px-2 py-2 text-left">Plus Tag</th>
                <th className="px-2 py-2 text-left">Campaign</th>
                <th className="px-2 py-2 text-left">Enabled</th>
                <th className="px-2 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r, i) => (
                <tr key={i} className="border-t">
                  <td className="px-2 py-2">
                    <Input
                      type="number"
                      value={r.priority}
                      onChange={(e) => setRule(i, "priority", Number(e.target.value))}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Input
                      placeholder="jane@acme.com"
                      value={r.to_email ?? ""}
                      onChange={(e) => setRule(i, "to_email", e.target.value)}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Input
                      placeholder="acme.com"
                      value={r.to_domain ?? ""}
                      onChange={(e) => setRule(i, "to_domain", e.target.value)}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Input
                      placeholder="campaignslug"
                      value={r.plus_tag ?? ""}
                      onChange={(e) => setRule(i, "plus_tag", e.target.value)}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <select
                      className="w-full rounded-md border bg-background p-2 text-sm"
                      value={r.campaign_id}
                      onChange={(e) => setRule(i, "campaign_id", e.target.value)}
                    >
                      {campaigns.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <Switch checked={r.enabled} onCheckedChange={(value) => setRule(i, "enabled", value)} />
                  </td>
                  <td className="px-2 py-2">
                    <Button variant="ghost" size="sm" onClick={() => removeRow(i)}>
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
              {rules.length === 0 && (
                <tr>
                  <td className="px-2 py-6 text-sm text-muted-foreground" colSpan={7}>
                    No routing rules yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex justify-between">
          <Button variant="outline" onClick={addRow} disabled={loading || campaigns.length === 0}>
            Add Rule
          </Button>
          <Button onClick={save} disabled={loading}>
            {loading ? "Saving..." : "Save Rules"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

