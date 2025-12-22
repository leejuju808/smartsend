"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type Pred = { field: string; op: string; value: string };

const FIELD_OPS: Record<string, string[]> = {
  company_category: ["eq", "in", "ilike"],
  company_industry: ["ilike", "in"],
  company_domain: ["ilike", "eq"],
  company_employee_count: ["gt", "gte", "lt", "lte", "eq", "in"],
  tech_stack: ["contains_any", "contains_all"],
  role_title: ["ilike", "in"],
  role_seniority: ["eq", "in"],
};

type CampaignOption = { id: string; name: string };

export function FilterBuilderModal({
  open,
  onOpenChange,
  onSaved,
  campaigns = [],
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: (savedViewId: string) => void;
  campaigns?: CampaignOption[];
}) {
  const [name, setName] = React.useState("ICP Fit (Custom)");
  const [desc, setDesc] = React.useState("");
  const [visibility, setVisibility] = React.useState<"private" | "team" | "system">("private");
  const [scope, setScope] = React.useState<"account" | "campaign">("account");
  const [campaignId, setCampaignId] = React.useState<string>("");
  const [preds, setPreds] = React.useState<Pred[]>([
    { field: "company_category", op: "eq", value: "SaaS" },
    { field: "tech_stack", op: "contains_any", value: "HubSpot" },
    { field: "company_employee_count", op: "gt", value: "50" },
  ]);

  const addPred = React.useCallback(() => {
    setPreds((prev) => [
      ...prev,
      { field: "company_domain", op: "ilike", value: "%.%"},
    ]);
  }, []);

  const removePred = React.useCallback((index: number) => {
    setPreds((prev) => prev.filter((_, idx) => idx !== index));
  }, []);

  async function save() {
    if (scope === "campaign" && !campaignId) {
      throw new Error("Select a campaign for campaign-scoped views");
    }

    const nodes = preds.map((pred) => {
      const shouldSplit = pred.op.startsWith("contains") || pred.op.endsWith("_in");
      const parsedValue = shouldSplit
        ? pred.value
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : Number.isFinite(Number(pred.value))
        ? Number(pred.value)
        : pred.value;

      return {
        field: pred.field,
        op: pred.op,
        value: parsedValue,
      };
    });

    const filters = { op: "AND", nodes };

    const res = await fetch("/api/saved-views", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        description: desc || undefined,
        filters,
        visibility,
        scope,
        campaignId: scope === "campaign" ? campaignId : undefined,
      }),
    });

    const json = await res.json();
    if (!res.ok) {
      throw new Error(json?.error ?? "Failed to save view");
    }

    onSaved(json.id);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New Saved View</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          <Input
            placeholder="Name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Textarea
            placeholder="Description (optional)"
            value={desc}
            onChange={(event) => setDesc(event.target.value)}
          />
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1">
              <div className="text-sm text-muted-foreground">Visibility</div>
              <Select value={visibility} onValueChange={(value) => setVisibility(value as typeof visibility)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Private</SelectItem>
                  <SelectItem value="team">Team</SelectItem>
                  <SelectItem value="system">System (admins)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <div className="text-sm text-muted-foreground">Scope</div>
              <Select
                value={scope}
                onValueChange={(value) => {
                  setScope(value as typeof scope);
                  if (value !== "campaign") {
                    setCampaignId("");
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="account">Account</SelectItem>
                  <SelectItem value="campaign">Campaign</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {scope === "campaign" && (
              <div className="grid gap-1">
                <div className="text-sm text-muted-foreground">Campaign</div>
                <Select value={campaignId} onValueChange={(value) => setCampaignId(value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select campaign" />
                  </SelectTrigger>
                  <SelectContent>
                    {campaigns.map((campaign) => (
                      <SelectItem key={campaign.id} value={campaign.id}>
                        {campaign.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="space-y-2">
            {preds.map((pred, index) => {
              const ops = FIELD_OPS[pred.field] ?? ["eq"];
              return (
                <div
                  key={`${pred.field}:${index}`}
                  className="grid grid-cols-12 items-center gap-2"
                >
                  <div className="col-span-4">
                    <Select
                      value={pred.field}
                      onValueChange={(value) => {
                        const nextOps = FIELD_OPS[value] ?? ["eq"];
                        setPreds((prev) =>
                          prev.map((current, idx) =>
                            idx === index
                              ? {
                                  ...current,
                                  field: value,
                                  op: nextOps.includes(current.op)
                                    ? current.op
                                    : nextOps[0],
                                }
                              : current
                          )
                        );
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Field" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.keys(FIELD_OPS).map((field) => (
                          <SelectItem key={field} value={field}>
                            {field}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-3">
                    <Select
                      value={pred.op}
                      onValueChange={(value) =>
                        setPreds((prev) =>
                          prev.map((current, idx) =>
                            idx === index ? { ...current, op: value } : current
                          )
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Operator" />
                      </SelectTrigger>
                      <SelectContent>
                        {(FIELD_OPS[pred.field] ?? ["eq"]).map((op) => (
                          <SelectItem key={op} value={op}>
                            {op}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Input
                    className="col-span-4"
                    placeholder="Value (comma-separated for lists)"
                    value={pred.value}
                    onChange={(event) =>
                      setPreds((prev) =>
                        prev.map((current, idx) =>
                          idx === index
                            ? { ...current, value: event.target.value }
                            : current
                        )
                      )
                    }
                  />
                  <Button
                    variant="ghost"
                    className="col-span-1"
                    onClick={() => removePred(index)}
                    type="button"
                  >
                    ✕
                  </Button>
                </div>
              );
            })}
            <Button variant="secondary" type="button" onClick={addPred}>
              + Add condition
            </Button>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={save}>
              Save View
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

