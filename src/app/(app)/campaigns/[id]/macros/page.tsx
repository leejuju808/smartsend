"use client";

import * as React from "react";
import useSWR from "swr";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/Badge";

type Macro = {
  id: string;
  key: string;
  title: string;
  body: string;
  tags: string[] | null;
  is_active: boolean;
};

type MacroMetric = {
  id: string;
  key: string;
  title: string;
  is_active: boolean;
  uses_7d: number;
};

const fetcher = async (url: string) => {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to load");
  }
  return res.json();
};

function useMacroList(campaignId: string, query: string) {
  const key = React.useMemo(() => {
    const params = new URLSearchParams();
    params.set("include_inactive", "1");
    if (query.trim()) {
      params.set("q", query.trim());
    }
    return `/api/macros/${campaignId}/list?${params.toString()}`;
  }, [campaignId, query]);

  const result = useSWR<Macro[]>(key, fetcher, { keepPreviousData: true });
  return result;
}

function useMacroMetrics(campaignId: string) {
  return useSWR<MacroMetric[]>(`/api/macros/${campaignId}/metrics`, fetcher);
}

type EditorState = {
  id?: string;
  key: string;
  title: string;
  tags: string;
  body: string;
  is_active: boolean;
};

const TOKENS = ["{{first_name}}", "{{last_name}}", "{{company}}", "{{email}}", "{{today}}", "{{weekday}}"];

export default function CampaignMacrosPage({ params }: { params: { id: string } }) {
  const campaignId = params.id;
  const [search, setSearch] = React.useState("");
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editorState, setEditorState] = React.useState<EditorState>({
    key: "",
    title: "",
    tags: "",
    body: "",
    is_active: true,
  });
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const {
    data: macros,
    mutate: mutateMacros,
    isLoading: macrosLoading,
  } = useMacroList(campaignId, search);

  const { data: metrics } = useMacroMetrics(campaignId);

  const openNewEditor = React.useCallback(() => {
    setEditorState({
      key: "",
      title: "",
      tags: "",
      body: "",
      is_active: true,
    });
    setError(null);
    setEditorOpen(true);
  }, []);

  const openEdit = React.useCallback((macro: Macro) => {
    setEditorState({
      id: macro.id,
      key: macro.key,
      title: macro.title,
      tags: (macro.tags ?? []).join(", "),
      body: macro.body,
      is_active: macro.is_active,
    });
    setError(null);
    setEditorOpen(true);
  }, []);

  const resetEditor = React.useCallback(() => {
    setEditorOpen(false);
    setEditorState({
      key: "",
      title: "",
      tags: "",
      body: "",
      is_active: true,
    });
    setSaving(false);
    setError(null);
  }, []);

  const handleSubmit = React.useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        id: editorState.id,
        campaign_id: campaignId,
        key: editorState.key.trim(),
        title: editorState.title.trim(),
        body: editorState.body,
        tags: editorState.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        is_active: editorState.is_active,
      };

      const res = await fetch("/api/macros/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to save macro");
      }

      await mutateMacros();
      setEditorOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save macro");
    } finally {
      setSaving(false);
    }
  }, [campaignId, editorState, mutateMacros]);

  const toggleMacroActive = React.useCallback(
    async (macro: Macro, next: boolean) => {
      const optimistic = macros ?? [];
      mutateMacros(
        optimistic.map((item) => (item.id === macro.id ? { ...item, is_active: next } : item)),
        false,
      );
      try {
        const res = await fetch("/api/macros/upsert", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: macro.id,
            campaign_id: campaignId,
            key: macro.key,
            title: macro.title,
            body: macro.body,
            tags: macro.tags ?? [],
            is_active: next,
          }),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || "Failed to update macro");
        }
        await mutateMacros();
      } catch (err) {
        console.error(err);
        await mutateMacros();
      }
    },
    [campaignId, macros, mutateMacros],
  );

  const handleArchive = React.useCallback(
    async (macro: Macro) => {
      if (!confirm(`Archive macro /${macro.key}?`)) return;
      const res = await fetch("/api/macros/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: macro.id, campaign_id: campaignId }),
      });
      if (res.ok) {
        await mutateMacros();
      }
    },
    [campaignId, mutateMacros],
  );

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Reply Macros</h1>
          <p className="text-sm text-muted-foreground">
            Create reusable replies with personalization tokens for your team.
          </p>
        </div>
        <Button onClick={openNewEditor}>New Macro</Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Library</CardTitle>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search macros…"
            className="max-w-xs"
          />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Key</th>
                  <th className="pb-2 pr-4 font-medium">Title</th>
                  <th className="pb-2 pr-4 font-medium">Tags</th>
                  <th className="pb-2 pr-4 font-medium">Active</th>
                  <th className="pb-2 pr-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {macrosLoading && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-muted-foreground">
                      Loading macros…
                    </td>
                  </tr>
                )}
                {!macrosLoading && (!macros || macros.length === 0) && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-muted-foreground">
                      No macros yet. Create your first template.
                    </td>
                  </tr>
                )}
                {(macros ?? []).map((macro) => (
                  <tr key={macro.id} className="border-t">
                    <td className="py-3 pr-4 font-mono text-xs">/{macro.key}</td>
                    <td className="py-3 pr-4">
                      <div className="font-medium">{macro.title}</div>
                      <div className="line-clamp-1 text-xs text-muted-foreground">{macro.body}</div>
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex flex-wrap gap-2">
                        {(macro.tags ?? []).length ? (
                          (macro.tags ?? []).map((tag) => (
                            <Badge key={tag} variant="secondary">
                              {tag}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <Switch checked={macro.is_active} onCheckedChange={(next) => toggleMacroActive(macro, next)} />
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => openEdit(macro)}>
                          Edit
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleArchive(macro)}>
                          Archive
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Usage (Last 7 days)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[320px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Macro</th>
                  <th className="pb-2 pr-4 font-medium">Uses</th>
                </tr>
              </thead>
              <tbody>
                {metrics && metrics.length === 0 && (
                  <tr>
                    <td colSpan={2} className="py-4 text-center text-muted-foreground">
                      No usage yet.
                    </td>
                  </tr>
                )}
                {(metrics ?? []).map((metric) => (
                  <tr key={metric.id} className="border-t">
                    <td className="py-3 pr-4">
                      <div className="font-medium">/{metric.key}</div>
                      <div className="text-xs text-muted-foreground">{metric.title}</div>
                    </td>
                    <td className="py-3 pr-4">{metric.uses_7d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={editorOpen} onOpenChange={(open) => (open ? setEditorOpen(true) : resetEditor())}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editorState.id ? "Edit macro" : "New macro"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-xs font-medium uppercase text-muted-foreground">Key</label>
                <Input
                  value={editorState.key}
                  onChange={(event) => setEditorState((prev) => ({ ...prev, key: event.target.value }))}
                  placeholder="pricing"
                />
              </div>
              <div>
                <label className="text-xs font-medium uppercase text-muted-foreground">Title</label>
                <Input
                  value={editorState.title}
                  onChange={(event) => setEditorState((prev) => ({ ...prev, title: event.target.value }))}
                  placeholder="Pricing overview"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium uppercase text-muted-foreground">Tags</label>
              <Input
                value={editorState.tags}
                onChange={(event) => setEditorState((prev) => ({ ...prev, tags: event.target.value }))}
                placeholder="pricing, overview"
              />
              <p className="mt-1 text-xs text-muted-foreground">Comma-separated (used for search filters).</p>
            </div>
            <div>
              <label className="text-xs font-medium uppercase text-muted-foreground">Body</label>
              <Textarea
                rows={8}
                value={editorState.body}
                onChange={(event) => setEditorState((prev) => ({ ...prev, body: event.target.value }))}
                placeholder="Write your canned reply. Tokens like {{first_name}} will auto-fill."
              />
            </div>
            <div>
              <label className="text-xs font-medium uppercase text-muted-foreground">Available Tokens</label>
              <div className="flex flex-wrap gap-2">
                {TOKENS.map((token) => (
                  <Badge key={token} variant="secondary">
                    {token}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between rounded-2xl border p-3">
              <div>
                <div className="text-sm font-medium">Active</div>
                <div className="text-xs text-muted-foreground">
                  Active macros show up in the composer slash menu.
                </div>
              </div>
              <Switch
                checked={editorState.is_active}
                onCheckedChange={(checked) => setEditorState((prev) => ({ ...prev, is_active: checked }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={resetEditor} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? "Saving…" : "Save macro"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}








