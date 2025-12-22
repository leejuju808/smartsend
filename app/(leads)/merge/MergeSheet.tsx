"use client";

import * as React from "react";
import useSWR from "swr";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

const FIELDS = [
  "first_name",
  "last_name",
  "company_name",
  "title",
  "phone",
  "timezone",
  "website",
  "linkedin_url",
  "twitter_url",
  "employee_count",
] as const;

type FieldKey = (typeof FIELDS)[number];

type Lead = Record<string, any>;

type Pair = {
  a: Lead;
  b: Lead;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pair: Pair;
  accountId: string;
  onDone: () => void;
};

export function MergeSheet({ open, onOpenChange, pair, accountId, onDone }: Props) {
  const [survivorId, setSurvivorId] = React.useState<string>(pair?.a?.id);

  const survivor = survivorId === pair?.a?.id ? pair?.a : pair?.b;
  const mergee = survivorId === pair?.a?.id ? pair?.b : pair?.a;

  const { data: preview } = useSWR(
    open && survivor?.id && mergee?.id ? ["/api/merge/preview", survivor?.id, mergee?.id] : null,
    async ([url, s, m]) => {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ survivor_id: s, mergee_id: m }),
      });
      return response.json();
    }
  );

  const [take, setTake] = React.useState<Record<FieldKey, "survivor" | "mergee">>(
    {} as Record<FieldKey, "survivor" | "mergee">
  );

  React.useEffect(() => {
    setSurvivorId(pair?.a?.id);
    setTake({} as Record<FieldKey, "survivor" | "mergee">);
  }, [pair]);

  function chosenValue(field: FieldKey) {
    if (take[field] === "mergee") return mergee?.[field];
    return survivor?.[field] ?? mergee?.[field];
  }

  async function runMerge() {
    if (!survivor?.id || !mergee?.id) return;

    const overrides: Record<string, unknown> = {};

    for (const field of FIELDS) {
      const survivorValue = survivor?.[field];
      const mergeeValue = mergee?.[field];
      if (take[field] === "mergee" && mergeeValue && mergeeValue !== survivorValue) {
        overrides[field] = mergeeValue;
      }
    }

    const body = {
      account_id: accountId,
      survivor_lead_id: survivor.id,
      mergee_lead_id: mergee.id,
      overrides,
    };

    const response = await fetch("/api/merge/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const json = await response.json();
    if (json.ok) {
      onDone();
      onOpenChange(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[760px]">
        <SheetHeader>
          <SheetTitle>Merge leads</SheetTitle>
        </SheetHeader>

        <div className="mt-3 text-sm space-y-3">
          <div className="flex gap-4">
            <div className="flex-1 border rounded-lg p-2">
              <div className="font-medium">A (left)</div>
              <div className="text-xs opacity-70">{pair?.a?.email ?? "—"}</div>
            </div>
            <div className="flex-1 border rounded-lg p-2">
              <div className="font-medium">B (right)</div>
              <div className="text-xs opacity-70">{pair?.b?.email ?? "—"}</div>
            </div>
          </div>

          <RadioGroup className="grid grid-cols-2 gap-2" value={survivorId} onValueChange={setSurvivorId}>
            <div className="border rounded-lg p-2 flex items-center">
              <RadioGroupItem id="survA" value={pair?.a?.id} />
              <Label htmlFor="survA" className="ml-2">
                Make A the survivor
              </Label>
            </div>
            <div className="border rounded-lg p-2 flex items-center">
              <RadioGroupItem id="survB" value={pair?.b?.id} />
              <Label htmlFor="survB" className="ml-2">
                Make B the survivor
              </Label>
            </div>
          </RadioGroup>

          <div className="grid grid-cols-3 gap-2">
            {FIELDS.map((field) => (
              <div key={field} className="border rounded-lg p-2">
                <div className="text-[11px] uppercase opacity-60 mb-1">{field.replaceAll("_", " ")}</div>
                <div className="text-xs">A: {String(pair?.a?.[field] ?? "—")}</div>
                <div className="text-xs">B: {String(pair?.b?.[field] ?? "—")}</div>
                <div className="mt-1 flex gap-2">
                  <Button
                    size="xs"
                    variant={take[field] === "survivor" ? "default" : "outline"}
                    onClick={() => setTake((prev) => ({ ...prev, [field]: "survivor" }))}
                  >
                    Use survivor
                  </Button>
                  <Button
                    size="xs"
                    variant={take[field] === "mergee" ? "default" : "outline"}
                    onClick={() => setTake((prev) => ({ ...prev, [field]: "mergee" }))}
                  >
                    Use mergee
                  </Button>
                </div>
                <div className="mt-1 text-[11px] opacity-70">Chosen: {String(chosenValue(field) ?? "—")}</div>
              </div>
            ))}
          </div>

          <div className="border rounded-lg p-2 text-xs">
            <div className="font-medium mb-1">Preview</div>
            <div>
              Threads: {preview?.totals?.survivor?.threads ?? 0} + {preview?.totals?.mergee?.threads ?? 0}
            </div>
            <div>
              Messages: {preview?.totals?.survivor?.messages ?? 0} + {preview?.totals?.mergee?.messages ?? 0}
            </div>
          </div>

          <div className="flex gap-2">
            <Button size="sm" onClick={runMerge}>
              Merge
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

