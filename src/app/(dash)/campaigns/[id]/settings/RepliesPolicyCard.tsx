"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

const DEFAULT_LABELS = [
  "human_reply",
  "question",
  "positive",
  "neutral",
  "routing",
] satisfies readonly string[];

type RepliesPolicyResponse = {
  policy: {
    auto_mark_replied: boolean;
    reply_labels: string[];
  };
};

export function RepliesPolicyCard({ id }: { id: string }) {
  const [loading, setLoading] = React.useState(true);
  const [autoMark, setAutoMark] = React.useState(true);
  const [labels, setLabels] = React.useState<string[]>([...DEFAULT_LABELS]);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let isMounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/campaign/${id}/replies-policy`);
        const json = (await response.json().catch(() => ({}))) as
          | RepliesPolicyResponse
          | undefined;

        if (!isMounted) return;

        setAutoMark(json?.policy?.auto_mark_replied ?? true);
        setLabels(json?.policy?.reply_labels ?? [...DEFAULT_LABELS]);
      } catch (err) {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : "Failed to load policy");
        setAutoMark(true);
        setLabels([...DEFAULT_LABELS]);
      } finally {
        if (!isMounted) return;
        setLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [id]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await fetch(`/api/campaign/${id}/replies-policy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auto_mark_replied: autoMark,
          reply_labels: labels.length ? labels : [...DEFAULT_LABELS],
        }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save policy");
    } finally {
      setSaving(false);
    }
  }

  function toggleLabel(lbl: string) {
    setLabels((prev) =>
      prev.includes(lbl) ? prev.filter((l) => l !== lbl) : [...prev, lbl]
    );
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">Auto-mark Replied</div>
            <div className="text-xs text-muted-foreground">
              When an inbound is labeled as a reply, stop the sequence and flag
              the thread for follow-up.
            </div>
          </div>
          <Switch
            checked={autoMark}
            onCheckedChange={(checked) => setAutoMark(checked)}
            disabled={loading}
          />
        </div>

        <div>
          <div className="mb-1 text-sm font-medium">
            Labels considered “reply”
          </div>
          <div className="flex flex-wrap gap-2">
            {DEFAULT_LABELS.map((lbl) => {
              const on = labels.includes(lbl);
              return (
                <button
                  key={lbl}
                  type="button"
                  className={`rounded-full border px-2 py-1 text-xs transition ${
                    on
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground"
                  }`}
                  onClick={() => toggleLabel(lbl)}
                  disabled={loading}
                >
                  {lbl}
                </button>
              );
            })}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            Tip: If you see false positives, deselect <code>neutral</code> or{" "}
            <code>routing</code>.
          </div>
        </div>

        {error ? (
          <div className="text-xs text-destructive">{error}</div>
        ) : null}

        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={save}
            disabled={saving || loading}
            variant="default"
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

