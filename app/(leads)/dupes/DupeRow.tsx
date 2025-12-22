"use client";

import * as React from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

type Candidate = {
  id: number;
  lead_a: string;
  lead_b: string;
  reason: string;
  name_sim: number | null;
  company_sim: number | null;
  email_exact: boolean;
};

type Lead = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  title: string | null;
  phone?: string | null;
};

type Strategy = "primary_wins" | "secondary_wins" | "fieldwise";

export function DupeRow({
  candidate,
  a,
  b,
  onMerged,
}: {
  candidate: Candidate;
  a?: Lead;
  b?: Lead;
  onMerged: () => void;
}) {
  const [strategy, setStrategy] = React.useState<Strategy>("primary_wins");
  const [fieldMap, setFieldMap] = React.useState<Record<string, "primary" | "secondary">>({});
  const [isMerging, setIsMerging] = React.useState(false);

  async function merge(primaryId: string, secondaryId: string) {
    try {
      setIsMerging(true);
      const body: Record<string, unknown> = {
        primary: primaryId,
        secondary: secondaryId,
        strategy,
      };

      if (strategy === "fieldwise") {
        const payload: Record<string, string> = {};
        Object.entries(fieldMap).forEach(([field, value]) => {
          payload[field] = value === "secondary" ? "secondary" : "primary";
        });
        body.fieldMap = payload;
      }

      const response = await fetch("/api/dupes/merge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || "Merge failed");
      }
      toast.success("Merged. Undo?", {
        action: {
          label: "Undo",
          onClick: async () => {
            try {
              const historyRes = await fetch("/api/dupes/history?limit=1");
              if (!historyRes.ok) {
                const err = await historyRes.json();
                throw new Error(err.error || "Failed to load merge history");
              }
              const historyJson = await historyRes.json();
              const last = historyJson.rows?.[0];
              if (!last?.id) {
                throw new Error("No merge audit found");
              }
              const undoRes = await fetch(`/api/dupes/undo/${last.id}`, { method: "POST" });
              const undoJson = await undoRes.json();
              if (!undoRes.ok) {
                throw new Error(undoJson.error || "Undo failed");
              }
              toast.success("Merge undone");
              onMerged();
            } catch (undoErr: any) {
              toast.error(undoErr?.message ?? "Undo failed");
            }
          },
        },
      });
      onMerged();
    } catch (err: any) {
      toast.error(err?.message ?? "Merge failed");
    } finally {
      setIsMerging(false);
    }
  }

  const fields = ["email", "first_name", "last_name", "company", "title", "phone"];
  const formatName = (lead?: Lead) =>
    [lead?.first_name ?? "", lead?.last_name ?? ""].filter(Boolean).join(" ") || "Unknown";

  return (
    <Card className="space-y-3 p-3">
      <div className="text-xs text-muted-foreground">
        reason: {candidate.reason} · name_sim: {(candidate.name_sim ?? 0).toFixed(2)} · company_sim:{" "}
        {(candidate.company_sim ?? 0).toFixed(2)}
      </div>

      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-5 rounded border p-2">
          <div className="font-medium">{formatName(a)}</div>
          <div className="text-sm">{a?.email ?? "—"}</div>
          <div className="text-sm">
            {a?.company ?? "—"} {a?.title ? `— ${a.title}` : ""}
          </div>
        </div>
        <div className="col-span-2 flex items-center justify-center text-sm uppercase text-muted-foreground">
          vs
        </div>
        <div className="col-span-5 rounded border p-2">
          <div className="font-medium">{formatName(b)}</div>
          <div className="text-sm">{b?.email ?? "—"}</div>
          <div className="text-sm">
            {b?.company ?? "—"} {b?.title ? `— ${b.title}` : ""}
          </div>
        </div>
      </div>

      <div className="border-t pt-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="opacity-70">Strategy:</span>
          <Button
            size="sm"
            variant={strategy === "primary_wins" ? "default" : "outline"}
            onClick={() => setStrategy("primary_wins")}
          >
            Primary wins
          </Button>
          <Button
            size="sm"
            variant={strategy === "secondary_wins" ? "default" : "outline"}
            onClick={() => setStrategy("secondary_wins")}
          >
            Secondary wins
          </Button>
          <Button
            size="sm"
            variant={strategy === "fieldwise" ? "default" : "outline"}
            onClick={() => setStrategy("fieldwise")}
          >
            Field-wise
          </Button>
        </div>

        {strategy === "fieldwise" ? (
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
            {fields.map((field) => (
              <label
                key={field}
                className="flex items-center justify-between rounded border px-2 py-1 text-sm"
              >
                <span className="opacity-70">{field.replace("_", " ")}</span>
                <div className="flex items-center gap-2">
                  <span className={fieldMap[field] !== "secondary" ? "font-medium" : ""}>A</span>
                  <Switch
                    checked={fieldMap[field] === "secondary"}
                    onCheckedChange={(value) =>
                      setFieldMap((current) => ({
                        ...current,
                        [field]: value ? "secondary" : "primary",
                      }))
                    }
                  />
                  <span className={fieldMap[field] === "secondary" ? "font-medium" : ""}>B</span>
                </div>
              </label>
            ))}
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            disabled={!a?.id || !b?.id || isMerging}
            onClick={() => a?.id && b?.id && merge(a.id, b.id)}
          >
            Merge → keep A
          </Button>
          <Button
            variant="outline"
            disabled={!a?.id || !b?.id || isMerging}
            onClick={() => a?.id && b?.id && merge(b.id, a.id)}
          >
            Merge → keep B
          </Button>
          <Button
            variant="ghost"
            disabled={isMerging}
            onClick={async () => {
              try {
                const res = await fetch("/api/dupes/refresh", { method: "POST" });
                if (!res.ok) {
                  const err = await res.json();
                  throw new Error(err.error || "Refresh failed");
                }
                toast.success("Suggestions rebuilt");
                onMerged();
              } catch (err: any) {
                toast.error(err?.message ?? "Refresh failed");
              }
            }}
          >
            Rebuild suggestions
          </Button>
        </div>
      </div>
    </Card>
  );
}

