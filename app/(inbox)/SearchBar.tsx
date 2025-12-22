"use client";

import * as React from "react";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

export type SearchRow = {
  thread_id: string;
  lead_email: string | null;
  company: string | null;
  label: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  assigned_to: string | null;
  domain: string | null;
  snippet: string | null;
};

export type SearchFormState = {
  q: string;
  label?: string;
  domain: string;
  assigned?: string;
  hasLinks?: boolean;
  overdue?: boolean;
  oooToday?: boolean;
  from?: Date;
  to?: Date;
};

export type SearchBarHandle = {
  run: () => void;
  applyParams: (params: Record<string, unknown>) => void;
  getState: () => SearchFormState;
};

type SearchBarProps = {
  campaignId?: string | null;
  onResults: (rows: SearchRow[]) => void;
  onLoadingChange?: (loading: boolean) => void;
  onParamsChange?: (state: SearchFormState) => void;
};

const DEFAULT_STATE: SearchFormState = {
  q: "",
  domain: "",
};

export const SearchBar = React.forwardRef<SearchBarHandle, SearchBarProps>(function SearchBar(
  { campaignId, onResults, onLoadingChange, onParamsChange },
  ref,
) {
  const [form, setForm] = React.useState<SearchFormState>(DEFAULT_STATE);
  const [loading, setLoading] = React.useState(false);
  const [fromOpen, setFromOpen] = React.useState(false);
  const [toOpen, setToOpen] = React.useState(false);

  const updateForm = React.useCallback(<K extends keyof SearchFormState>(key: K, value: SearchFormState[K]) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "q" && typeof value === "string" && value.length === 0) {
        next.q = "";
      }
      if (key === "domain" && typeof value === "string") {
        next.domain = value;
      }
      return next;
    });
  }, []);

  const resetForm = React.useCallback(() => {
    setForm(DEFAULT_STATE);
  }, []);

  const run = React.useCallback(async () => {
    if (!campaignId) {
      onResults([]);
      return;
    }

    setLoading(true);
    onLoadingChange?.(true);

    try {
      const qs = new URLSearchParams({ campaignId });
      if (form.q) qs.set("q", form.q);
      if (form.label) qs.set("label", form.label);
      if (form.domain) qs.set("domain", form.domain.toLowerCase());
      if (form.assigned) qs.set("assigned", form.assigned);
      if (form.hasLinks !== undefined) qs.set("has_links", form.hasLinks ? "1" : "0");
      if (form.overdue !== undefined) qs.set("overdue", form.overdue ? "1" : "0");
      if (form.oooToday !== undefined) qs.set("ooo_today", form.oooToday ? "1" : "0");
      if (form.from) qs.set("from", form.from.toISOString());
      if (form.to) qs.set("to", form.to.toISOString());

      const response = await fetch(`/api/search/threads?${qs.toString()}`, { cache: "no-store" });
      if (!response.ok) {
        throw new Error("search_failed");
      }

      const payload = (await response.json()) as { rows?: SearchRow[] };
      const rows = Array.isArray(payload?.rows) ? payload.rows : [];
      onResults(rows);
    } catch (error) {
      console.error("Failed to search threads", error);
      onResults([]);
    } finally {
      setLoading(false);
      onLoadingChange?.(false);
    }
  }, [campaignId, form, onLoadingChange, onResults]);

  const applyParams = React.useCallback((params: Record<string, unknown>) => {
    setForm(() => {
      const next: SearchFormState = {
        q: typeof params.q === "string" ? params.q : typeof params.p_q === "string" ? params.p_q : "",
        label: coalesceString(params.label ?? params.p_label),
        domain: coalesceString(params.domain ?? params.p_domain, ""),
        assigned: coalesceString(params.assigned ?? params.p_assigned),
        hasLinks: coalesceBoolean(params.has_links ?? params.p_has_links),
        overdue: coalesceBoolean(params.overdue ?? params.p_overdue),
        oooToday: coalesceBoolean(params.ooo_today ?? params.p_ooo_today),
        from: coalesceDate(params.date_from ?? params.p_date_from),
        to: coalesceDate(params.date_to ?? params.p_date_to),
      };
      return next;
    });
  }, []);

  React.useEffect(() => {
    onParamsChange?.(form);
  }, [form, onParamsChange]);

  React.useEffect(() => {
    if (!campaignId) {
      onResults([]);
      return;
    }
    run();
  }, [campaignId, run, onResults]);

  React.useImperativeHandle(
    ref,
    () => ({
      run,
      applyParams,
      getState: () => form,
    }),
    [applyParams, form, run],
  );

  const activeChips = React.useMemo(() => {
    const chips: { key: string; label: string; onClear: () => void }[] = [];
    if (form.q) chips.push({ key: "q", label: `Text: ${form.q}`, onClear: () => updateForm("q", "") });
    if (form.label)
      chips.push({
        key: "label",
        label: `Label: ${form.label}`,
        onClear: () => updateForm("label", undefined),
      });
    if (form.domain)
      chips.push({
        key: "domain",
        label: `Domain: ${form.domain}`,
        onClear: () => updateForm("domain", ""),
      });
    if (form.assigned)
      chips.push({
        key: "assigned",
        label: "Assigned",
        onClear: () => updateForm("assigned", undefined),
      });
    if (form.hasLinks !== undefined)
      chips.push({
        key: "hasLinks",
        label: form.hasLinks ? "Has links" : "No links",
        onClear: () => updateForm("hasLinks", undefined),
      });
    if (form.overdue !== undefined)
      chips.push({
        key: "overdue",
        label: form.overdue ? "Overdue" : "Not overdue",
        onClear: () => updateForm("overdue", undefined),
      });
    if (form.oooToday !== undefined)
      chips.push({
        key: "oooToday",
        label: "OOO today",
        onClear: () => updateForm("oooToday", undefined),
      });
    if (form.from)
      chips.push({
        key: "from",
        label: `From ${format(form.from, "MMM d")}`,
        onClear: () => updateForm("from", undefined),
      });
    if (form.to)
      chips.push({
        key: "to",
        label: `To ${format(form.to, "MMM d")}`,
        onClear: () => updateForm("to", undefined),
      });
    return chips;
  }, [form, updateForm]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={form.q}
          onChange={(event) => updateForm("q", event.target.value)}
          placeholder="Search text, email, company…"
          className="w-64"
        />

        <Select value={form.label ?? ""} onValueChange={(value) => updateForm("label", value || undefined)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Label" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Any label</SelectItem>
            <SelectItem value="question">Question</SelectItem>
            <SelectItem value="positive">Positive</SelectItem>
            <SelectItem value="neutral">Neutral</SelectItem>
            <SelectItem value="negative">Negative</SelectItem>
            <SelectItem value="ooo">OOO</SelectItem>
          </SelectContent>
        </Select>

        <Input
          value={form.domain}
          onChange={(event) => updateForm("domain", event.target.value)}
          placeholder="Domain (acme.com)"
          className="w-48"
        />

        <Input
          value={form.assigned ?? ""}
          onChange={(event) => updateForm("assigned", event.target.value || undefined)}
          placeholder="Assigned user id"
          className="w-44"
        />

        <ToggleSwitch
          label="Has links"
          checked={form.hasLinks ?? false}
          onCheckedChange={(value) => updateForm("hasLinks", value)}
          indeterminate={form.hasLinks === undefined}
        />
        <ToggleSwitch
          label="Overdue"
          checked={form.overdue ?? false}
          onCheckedChange={(value) => updateForm("overdue", value)}
          indeterminate={form.overdue === undefined}
        />
        <ToggleSwitch
          label="OOO today"
          checked={form.oooToday ?? false}
          onCheckedChange={(value) => updateForm("oooToday", value)}
          indeterminate={form.oooToday === undefined}
        />

        <Popover open={fromOpen} onOpenChange={setFromOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="w-28 justify-start">
              {form.from ? format(form.from, "MMM d, yyyy") : "From date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="p-2">
            <Calendar
              mode="single"
              selected={form.from}
              initialFocus
              onSelect={(day) => {
                updateForm("from", day ?? undefined);
                setFromOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>

        <Popover open={toOpen} onOpenChange={setToOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="w-28 justify-start">
              {form.to ? format(form.to, "MMM d, yyyy") : "To date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="p-2">
            <Calendar
              mode="single"
              selected={form.to}
              initialFocus
              onSelect={(day) => {
                updateForm("to", day ?? undefined);
                setToOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>

        <Button size="sm" onClick={run} disabled={loading || !campaignId}>
          {loading ? "Searching…" : "Search"}
        </Button>
        <Button size="sm" variant="ghost" onClick={resetForm} disabled={loading}>
          Reset
        </Button>
      </div>

      {activeChips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {activeChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={chip.onClear}
              className={cn(
                "flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition-colors",
                "bg-muted hover:bg-muted/80",
              )}
            >
              <span>{chip.label}</span>
              <X className="h-3 w-3" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

function ToggleSwitch({
  label,
  checked,
  onCheckedChange,
  indeterminate,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (value: boolean | undefined) => void;
  indeterminate: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      <Switch
        checked={checked}
        onCheckedChange={(value) => {
          if (indeterminate && !value) {
            onCheckedChange(undefined);
          } else {
            onCheckedChange(value);
          }
        }}
        onClick={(event) => {
          if (indeterminate) {
            event.preventDefault();
            onCheckedChange(true);
          }
        }}
      />
      <button
        type="button"
        className="text-xs text-muted-foreground hover:text-foreground"
        onClick={() => onCheckedChange(undefined)}
      >
        {label}
      </button>
    </div>
  );
}

function coalesceString(value: unknown, fallback?: string) {
  if (typeof value === "string") return value;
  return fallback;
}

function coalesceBoolean(value: unknown) {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "boolean") return value;
  if (value === "1" || value === 1) return true;
  if (value === "0" || value === 0) return false;
  return undefined;
}

function coalesceDate(value: unknown) {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return undefined;
}






