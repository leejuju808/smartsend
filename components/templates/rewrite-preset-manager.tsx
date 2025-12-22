"use client";

import * as React from "react";
import {
  listRewritePresets,
  type RewritePresetRow,
} from "@/app/api/rewrite-presets/list/actions";
import { RewritePresetForm } from "./rewrite-preset-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/Badge";
import { Loader2, Sparkles, Plus, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

interface RewritePresetManagerProps {
  accountId: string;
  ownerId: string;
}

export function RewritePresetManager({ accountId, ownerId }: RewritePresetManagerProps) {
  const [presets, setPresets] = React.useState<RewritePresetRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [editing, setEditing] = React.useState<RewritePresetRow | null>(null);
  const [creating, setCreating] = React.useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const data = await listRewritePresets(accountId);
      setPresets(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  function handleCreatedOrUpdated() {
    setEditing(null);
    setCreating(false);
    refresh();
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-base font-semibold">Smart Rewriter presets</h1>
            <p className="text-xs text-muted-foreground">
              Define reusable rewrite styles your whole team can use in the composer.
            </p>
          </div>
        </div>

        <Button
          type="button"
          size="sm"
          onClick={() => {
            setEditing(null);
            setCreating(true);
          }}
        >
          <Plus className="mr-1 h-3 w-3" />
          New preset
        </Button>
      </div>

      {/* Editor panel */}
      {(creating || editing) && (
        <Card className="border bg-card p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium">
              {editing ? "Edit preset" : "Create preset"}
            </p>
          </div>
          <RewritePresetForm
            accountId={accountId}
            ownerId={ownerId}
            initial={editing ? (editing as any) : undefined}
            onSaved={handleCreatedOrUpdated}
            onCancel={() => {
              setEditing(null);
              setCreating(false);
            }}
          />
        </Card>
      )}

      {/* List */}
      <Card className="border bg-card">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-xs text-muted-foreground">
            {presets.length === 0
              ? "No presets yet. Create your first one above."
              : `You have ${presets.length} rewrite preset${
                  presets.length === 1 ? "" : "s"
                }.`}
          </p>
          {loading && (
            <span className="inline-flex items-center text-[11px] text-muted-foreground">
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              Loading…
            </span>
          )}
        </div>

        {presets.length > 0 && (
          <div className="max-h-[480px] overflow-auto">
            <table className="min-w-full text-xs">
              <thead className="sticky top-0 z-10 bg-muted">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Name</th>
                  <th className="px-3 py-2 text-left font-semibold">Mode</th>
                  <th className="px-3 py-2 text-left font-semibold">Tone</th>
                  <th className="px-3 py-2 text-left font-semibold">Max words</th>
                  <th className="px-3 py-2 text-left font-semibold">Instructions</th>
                  <th className="px-3 py-2 text-left font-semibold w-[80px]"></th>
                </tr>
              </thead>
              <tbody>
                {presets.map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="px-3 py-2 align-top">
                      <div className="flex flex-col gap-1">
                        <span className="font-medium">{p.name}</span>
                        {p.description && (
                          <span className="text-[11px] text-muted-foreground">
                            {p.description}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <Badge variant="outline" className="text-[10px]">
                        {p.config.mode}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px]",
                          p.config.tone === "friendly" && "text-emerald-600",
                          p.config.tone === "assertive" && "text-red-600"
                        )}
                      >
                        {p.config.tone}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 align-top">
                      {p.config.max_words ?? "—"}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <p className="line-clamp-3 max-w-[320px] text-[11px] text-muted-foreground">
                        {p.config.instructions}
                      </p>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          setCreating(false);
                          setEditing(p);
                        }}
                        aria-label="Edit preset"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}













