"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type Variant = {
  id: string;
  campaign_id: string;
  scenario: string;
  tone: string;
  name: string;
  subject: string;
  body: string;
  weight: number;
  is_active: boolean;
  pinned?: boolean;
  pinned_weight?: number | null;
};

const SCENARIOS = ["no_reply", "question", "positive", "neutral", "routing"];
const TONES = ["professional", "friendly", "concise", "assertive"];

export default function NudgeVariantSandbox({ campaignId }: { campaignId: string }) {
  const [loading, setLoading] = React.useState(false);
  const [variants, setVariants] = React.useState<Variant[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<Variant | null>(null);
  const [email, setEmail] = React.useState("");

  const load = React.useCallback(
    async (preferId?: string) => {
      setLoading(true);
      try {
        const response = await fetch(`/api/campaign/${campaignId}/nudge/variants`, { cache: "no-store" });
        const json = await response.json();

        if (!json?.ok) {
          toast.error("Failed to load variants");
          return;
        }

        const list: Variant[] = Array.isArray(json.variants) ? json.variants : [];
        setVariants(list);

        setSelectedId((prev) => {
          let next = preferId ?? prev ?? null;
          const ids = new Set(list.map((v) => v.id));

          if (next && !ids.has(next)) {
            next = list.length ? list[0].id : null;
          }

          if (!next && list.length) {
            next = list[0].id;
          }

          return next ?? null;
        });
      } catch (err) {
        console.error(err);
        toast.error("Failed to load variants");
      } finally {
        setLoading(false);
      }
    },
    [campaignId],
  );

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    if (!selectedId) {
      setDraft(null);
      return;
    }

    const current = variants.find((v) => v.id === selectedId);
    setDraft(current ? { ...current } : null);
  }, [variants, selectedId]);

  async function createBlank() {
    try {
      const response = await fetch(`/api/campaign/${campaignId}/nudge/variants`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "New variant",
          scenario: "no_reply",
          tone: "professional",
          subject: "",
          body: "",
          weight: 1,
        }),
      });
      const json = await response.json();
      if (json.ok && json.variant) {
        toast.success("Variant created");
        await load(json.variant.id as string);
      } else {
        toast.error("Failed to create variant");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to create variant");
    }
  }

  async function save(variant: Variant) {
    try {
      const response = await fetch(`/api/nudge-variant/${variant.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: variant.name,
          scenario: variant.scenario,
          tone: variant.tone,
          subject: variant.subject,
          body: variant.body,
          weight: variant.weight,
          is_active: variant.is_active,
        }),
      });
      const json = await response.json();
      if (json.ok) {
        toast.success("Saved");
        await load(variant.id);
      } else {
        toast.error("Save failed");
      }
    } catch (err) {
      console.error(err);
      toast.error("Save failed");
    }
  }

  async function duplicate(id: string) {
    try {
      const response = await fetch(`/api/nudge-variant/${id}/duplicate`, { method: "POST" });
      const json = await response.json();
      if (json.ok && json.variant) {
        toast.success("Duplicated");
        await load(json.variant.id as string);
      } else {
        toast.error("Duplicate failed");
      }
    } catch (err) {
      console.error(err);
      toast.error("Duplicate failed");
    }
  }

  async function toggleActive(variantId: string, on: boolean) {
    try {
      await fetch(`/api/nudge-variant/${variantId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ is_active: on }),
      });
    } finally {
      await load(variantId);
    }
  }

  async function quickWeight1(variantId: string) {
    try {
      await fetch(`/api/nudge-variant/${variantId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ weight: 1.0 }),
      });
    } finally {
      await load(variantId);
    }
  }

  async function testSend(variant: Variant) {
    if (!email) {
      toast.error("Enter your email for test send.");
      return;
    }

    try {
      const response = await fetch(`/api/campaign/${campaignId}/nudge/test-send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          to: email,
          subject: variant.subject || "(no subject)",
          body: renderPreviewBody(variant.body || ""),
        }),
      });
      const json = await response.json();
      if (json.ok) {
        toast.success("Draft queued to send worker (test).");
      } else {
        toast.error("Test send failed.");
      }
    } catch (err) {
      console.error(err);
      toast.error("Test send failed.");
    }
  }

  const selected = draft;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">A/B Sandbox</h2>
        <div className="flex items-center gap-2">
          <Input
            placeholder="your@email.com"
            className="w-56"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button variant="outline" size="sm" onClick={() => load()} disabled={loading}>
            Refresh
          </Button>
          <Button size="sm" onClick={createBlank}>
            New variant
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-md border">
          <div className="flex items-center justify-between border-b p-2 text-sm">
            <div>Variants</div>
            <div className="text-muted-foreground">{variants.length}</div>
          </div>
          <div className="max-h-[520px] overflow-y-auto">
            {variants.map((variant) => (
              <button
                key={variant.id}
                onClick={() => {
                  setSelectedId(variant.id);
                  setDraft({ ...variant });
                }}
                className={`w-full border-b px-3 py-2 text-left hover:bg-muted/40 ${
                  selected?.id === variant.id ? "bg-muted/40" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium">{variant.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {variant.scenario} · {variant.tone}
                  </div>
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {variant.subject || "(no subject)"}
                </div>
                {!variant.is_active && (
                  <div className="mt-1 text-[10px] uppercase text-amber-600">Inactive</div>
                )}
              </button>
            ))}
            {variants.length === 0 && (
              <div className="p-4 text-sm text-muted-foreground">No variants yet. Create one →</div>
            )}
          </div>
        </div>

        <div className="rounded-md border p-3">
          {!selected ? (
            <div className="text-sm text-muted-foreground">Select a variant to edit.</div>
          ) : (
            <Editor
              variant={selected}
              onChange={setDraft}
              onSave={() => save(selected)}
              onDuplicate={() => duplicate(selected.id)}
              onToggleActive={(on) => toggleActive(selected.id, on)}
              onQuickWeight={() => quickWeight1(selected.id)}
              onTest={() => testSend(selected)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function renderPreviewBody(raw: string) {
  return raw
    .replaceAll("{lead_first}", "Alex")
    .replaceAll("{company}", "Acme Co.")
    .replaceAll("{me}", "SmartSend")
    .replaceAll("{duration}", "30")
    .replaceAll("{booking_link}", "https://cal.com/you/intro")
    .replaceAll("{last_msg}", "—")
    .replaceAll("{cta}", "Open to a quick intro?");
}

function Editor({
  variant,
  onChange,
  onSave,
  onDuplicate,
  onToggleActive,
  onQuickWeight,
  onTest,
}: {
  variant: Variant;
  onChange: (variant: Variant) => void;
  onSave: () => void;
  onDuplicate: () => void;
  onToggleActive: (on: boolean) => void;
  onQuickWeight: () => void;
  onTest: () => void;
}) {
  const previewBody = renderPreviewBody(variant.body || "");

  return (
    <div className="space-y-3">
      <div className="grid gap-2 md:grid-cols-2">
        <div>
          <div className="text-xs text-muted-foreground">Name</div>
          <Input
            value={variant.name}
            onChange={(e) => onChange({ ...variant, name: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-xs text-muted-foreground">Scenario</div>
            <select
              className="w-full rounded border px-2 py-1 text-sm"
              value={variant.scenario}
              onChange={(e) => onChange({ ...variant, scenario: e.target.value })}
            >
              {SCENARIOS.map((scenario) => (
                <option key={scenario} value={scenario}>
                  {scenario}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Tone</div>
            <select
              className="w-full rounded border px-2 py-1 text-sm"
              value={variant.tone}
              onChange={(e) => onChange({ ...variant, tone: e.target.value })}
            >
              {TONES.map((tone) => (
                <option key={tone} value={tone}>
                  {tone}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div>
        <div className="text-xs text-muted-foreground">Subject</div>
        <Input
          value={variant.subject}
          onChange={(e) => onChange({ ...variant, subject: e.target.value })}
        />
      </div>

      <div>
        <div className="text-xs text-muted-foreground">Body</div>
        <Textarea
          rows={10}
          value={variant.body}
          onChange={(e) => onChange({ ...variant, body: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <div className="text-xs text-muted-foreground">Weight</div>
          <Input
            type="number"
            step="0.1"
            value={variant.weight}
            onChange={(e) => {
              const value = Number.parseFloat(e.target.value);
              onChange({ ...variant, weight: Number.isFinite(value) ? value : 0 });
            }}
          />
        </div>
        <div className="flex items-end">
          <Button variant="outline" className="w-full" onClick={onQuickWeight}>
            Set 1.0
          </Button>
        </div>
        <div className="flex items-end">
          <Button
            variant={variant.is_active ? "destructive" : "default"}
            className="w-full"
            onClick={() => onToggleActive(!variant.is_active)}
          >
            {variant.is_active ? "Deactivate" : "Activate"}
          </Button>
        </div>
      </div>

      <div className="rounded-md border bg-muted/40 p-2">
        <div className="mb-1 text-xs text-muted-foreground">Live preview (tokens stubbed)</div>
        <div className="text-sm">
          <b>Subject:</b> {variant.subject || "(no subject)"}
        </div>
        <pre className="mt-1 whitespace-pre-wrap text-sm">{previewBody || "(body empty)"}</pre>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          Tip: Use tokens like {"{lead_first}"}, {"{company}"}, {"{cta}"}.
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onDuplicate}>
            Duplicate
          </Button>
          <Button variant="outline" onClick={onTest}>
            Test send
          </Button>
          <Button onClick={onSave}>Save</Button>
        </div>
      </div>
    </div>
  );
}


