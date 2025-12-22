"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Bot, Sparkles, Loader2, Star } from "lucide-react";
import { cn } from "@/lib/utils";

type Persona = {
  id: string;
  org_id: string;
  name: string;
  description: string;
  tone: string | null;
  formality: string | null;
  email_length: string | null;
  region: string | null;
  avoid_phrases: string[] | null;
  signature_hint: string | null;
  is_default: boolean;
  created_at: string;
};

export function PersonasManager({
  orgId,
  personas,
  settings,
}: {
  orgId: string;
  personas: Persona[];
  settings: any;
}) {
  const [list, setList] = useState<Persona[]>(personas);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);

  const [form, setForm] = useState({
    name: "",
    description: "",
    tone: "",
    formality: "",
    email_length: "",
    region: "",
    avoid_phrases: "",
    signature_hint: "",
  });

  const defaultPersonaId = settings?.default_persona_id || null;

  const onChange = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.description.trim()) return;
    setCreating(true);

    try {
      const res = await fetch("/api/sdr-personas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: orgId,
          ...form,
          avoid_phrases: form.avoid_phrases
            ? form.avoid_phrases.split(",").map((s) => s.trim()).filter(Boolean)
            : [],
        }),
      });

      if (!res.ok) throw new Error("Failed to create persona");
      const json = await res.json();
      setList((prev) => [...prev, json.persona]);
      setForm({
        name: "",
        description: "",
        tone: "",
        formality: "",
        email_length: "",
        region: "",
        avoid_phrases: "",
        signature_hint: "",
      });
    } catch (err) {
      console.error(err);
      alert("Failed to create persona");
    } finally {
      setCreating(false);
    }
  };

  const setAsDefault = async (id: string) => {
    setSaving(true);
    try {
      const res = await fetch("/api/sdr-personas/default", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: orgId, persona_id: id }),
      });
      if (!res.ok) throw new Error("failed");

      setList((prev) =>
        prev.map((p) => ({ ...p, is_default: p.id === id })),
      );
    } catch (err) {
      console.error(err);
      alert("Failed to set default persona");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4 text-xs">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-purple-500" />
            <div>
              <h1 className="text-sm font-semibold">
                AI SDR Personas
              </h1>
              <p className="text-[11px] text-muted-foreground">
                Define how your AI SDR speaks. Set an org-wide default and reuse for leads.
              </p>
            </div>
          </div>
          <Badge variant="outline" className="text-[10px]">
            <Sparkles className="mr-1 h-3 w-3" />
            Voice & Tone
          </Badge>
        </div>

        {/* New persona form */}
        <form
          onSubmit={handleCreate}
          className="space-y-3 rounded-md border bg-muted/40 p-3"
        >
          <div className="grid gap-2 md:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-[11px]">Name</Label>
              <Input
                className="h-8 text-xs"
                placeholder="e.g. Direct, short, US SaaS SDR"
                value={form.name}
                onChange={(e) => onChange("name", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Region</Label>
              <Input
                className="h-8 text-xs"
                placeholder="e.g. US, UK, EU"
                value={form.region}
                onChange={(e) => onChange("region", e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-[11px]">Tone</Label>
              <Input
                className="h-8 text-xs"
                placeholder="e.g. direct, friendly, confident"
                value={form.tone}
                onChange={(e) => onChange("tone", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Formality</Label>
              <Input
                className="h-8 text-xs"
                placeholder="casual / neutral / formal"
                value={form.formality}
                onChange={(e) => onChange("formality", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Email length</Label>
              <Input
                className="h-8 text-xs"
                placeholder="short / medium / long"
                value={form.email_length}
                onChange={(e) => onChange("email_length", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px]">Description</Label>
            <Textarea
              className="min-h-[70px] text-[11px]"
              placeholder="Describe how this persona should sound and behave in emails."
              value={form.description}
              onChange={(e) => onChange("description", e.target.value)}
            />
          </div>

          <div className="grid gap-2 md:grid-cols-[2fr,1fr]">
            <div className="space-y-1">
              <Label className="text-[11px]">Phrases to avoid</Label>
              <Input
                className="h-8 text-xs"
                placeholder="comma-separated, e.g. circle back, touch base"
                value={form.avoid_phrases}
                onChange={(e) => onChange("avoid_phrases", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Signature hint</Label>
              <Input
                className="h-8 text-xs"
                placeholder="e.g. First name only, no sign-off, etc."
                value={form.signature_hint}
                onChange={(e) => onChange("signature_hint", e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              size="sm"
              type="submit"
              disabled={creating}
              className="h-7 text-[11px]"
            >
              {creating ? (
                <>
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  Creating…
                </>
              ) : (
                "Create persona"
              )}
            </Button>
          </div>
        </form>
      </Card>

      {/* Existing personas */}
      <div className="space-y-2">
        {list.length === 0 ? (
          <Card className="p-4 text-center text-[11px] text-muted-foreground">
            No personas yet. Create one to define how your AI SDR sounds.
          </Card>
        ) : (
          list.map((p) => (
            <Card
              key={p.id}
              className={cn(
                "space-y-2 p-3 text-xs",
                p.is_default && "border-primary/50",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {p.name}
                    </span>
                    {p.is_default && (
                      <Badge
                        variant="outline"
                        className="border-primary/40 bg-primary/10 text-[9px] text-primary"
                      >
                        <Star className="mr-1 h-3 w-3" />
                        Default
                      </Badge>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    Tone: {p.tone || "—"} · Formality: {p.formality || "—"} · Length:{" "}
                    {p.email_length || "—"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px]"
                    disabled={saving || p.is_default}
                    onClick={() => setAsDefault(p.id)}
                  >
                    {saving && !p.is_default ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : (
                      <Star className="mr-1 h-3 w-3" />
                    )}
                    Set default
                  </Button>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground whitespace-pre-wrap">
                {p.description}
              </p>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

