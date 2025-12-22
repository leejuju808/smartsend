"use client";

import * as React from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/Button";
import { toast } from "sonner";
import { DupeRow } from "./DupeRow";
import { MergeHistory } from "./MergeHistory";

type Candidate = {
  id: number;
  lead_a: string;
  lead_b: string;
  reason: string;
  name_sim: number | null;
  company_sim: number | null;
  email_exact: boolean;
  created_at: string;
};

type Lead = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  title: string | null;
  phone: string | null;
  domain_norm: string | null;
};

export function DupeDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
}) {
  const [rows, setRows] = React.useState<Candidate[]>([]);
  const [leads, setLeads] = React.useState<Record<string, Lead>>({});
  const [isLoading, setIsLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/dupes?limit=200");
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to load duplicates");
      }
      const leadMap: Record<string, Lead> = {};
      (json.leads ?? []).forEach((lead: Lead) => {
        leadMap[lead.id] = lead;
      });
      setLeads(leadMap);
      setRows(json.rows ?? []);
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message ?? "Failed to load duplicates");
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (open) {
      load();
    }
  }, [open, load]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="h-[85vh]">
        <DrawerHeader>
          <div className="flex items-center justify-between gap-3">
            <DrawerTitle>Potential Duplicates</DrawerTitle>
            <Button variant="secondary" onClick={load} disabled={isLoading}>
              Refresh
            </Button>
          </div>
        </DrawerHeader>

        <div className="grid h-full grid-rows-[auto,1fr]">
          <div className="px-4 text-xs text-muted-foreground">
            Suggestions are generated from matching email, shared domains, and fuzzy name/company
            similarity.
          </div>
          <div className="space-y-6 overflow-auto p-4">
            {rows.map((row) => (
              <DupeRow
                key={row.id}
                candidate={row}
                a={leads[row.lead_a]}
                b={leads[row.lead_b]}
                onMerged={load}
              />
            ))}
            {!rows.length && !isLoading ? (
              <div className="rounded border border-dashed p-6 text-sm text-muted-foreground">
                No duplicates found.
              </div>
            ) : null}
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, idx) => (
                  <div key={idx} className="h-24 w-full animate-pulse rounded-lg border bg-muted" />
                ))}
              </div>
            ) : null}
            <div className="space-y-2 border-t pt-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Recent merges
              </div>
              <MergeHistory />
            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

