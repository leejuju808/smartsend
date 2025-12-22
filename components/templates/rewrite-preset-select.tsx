"use client";

import * as React from "react";
import { listRewritePresets, type RewritePresetRow } from "@/app/api/rewrite-presets/list/actions";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface RewritePresetSelectProps {
  accountId: string;
  value: string | null;
  onChange: (presetId: string | null) => void;
}

export function RewritePresetSelect({
  accountId,
  value,
  onChange,
}: RewritePresetSelectProps) {
  const [presets, setPresets] = React.useState<RewritePresetRow[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      try {
        const data = await listRewritePresets(accountId);
        if (mounted) setPresets(data);
      } catch (err) {
        console.error(err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [accountId]);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-2 py-1.5">
      <div className="flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-medium">Smart rewriter</span>
      </div>

      <Select
        value={value ?? "___NONE"}
        onValueChange={(val) => {
          if (val === "___NONE") onChange(null);
          else onChange(val);
        }}
        disabled={loading}
      >
        <SelectTrigger className={cn("h-8 w-[220px] text-xs")}>
          <SelectValue
            placeholder={loading ? "Loading presets..." : "Choose rewrite preset"}
          />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="___NONE">No preset</SelectItem>
          {presets.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}

      <p className="text-[10px] text-muted-foreground">
        Presets are shared across your account (team-wide).
      </p>
    </div>
  );
}













